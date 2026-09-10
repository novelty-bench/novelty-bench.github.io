import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path

from generate_leaderboard_data import (
    PAPER_EVAL_DATE,
    generate_leaderboard_data,
    source_of,
)


def write_run(root, date, family, model, scores, metadata=None):
    """Lay out one model's curated and wildchat summaries under a temp root."""
    for dataset in ("curated", "wildchat"):
        path = Path(root) / "eval" / date / dataset / family / model
        path.mkdir(parents=True)
        (path / "summary.json").write_text(
            json.dumps({"mean_distinct": scores[0], "mean_utility": scores[1]})
        )
        if metadata:
            (path / "metadata.json").write_text(json.dumps(metadata))


def run_generator(directory):
    original_dir = Path.cwd()
    try:
        os.chdir(directory)
        with contextlib.redirect_stdout(io.StringIO()):
            return generate_leaderboard_data()
    finally:
        os.chdir(original_dir)


class SourceTests(unittest.TestCase):
    def test_paper_release_date_is_the_published_source(self):
        self.assertEqual(source_of(PAPER_EVAL_DATE, None), "paper")

    def test_later_runs_of_our_own_are_attributed_to_the_authors(self):
        self.assertEqual(source_of("09-10-2026", None), "authors")

    def test_a_submitter_makes_an_entry_a_community_contribution(self):
        self.assertEqual(
            source_of("09-10-2026", {"submitted_by": "someone"}), "community"
        )

    def test_a_submission_on_the_paper_date_is_still_community(self):
        self.assertEqual(
            source_of(PAPER_EVAL_DATE, {"submitted_by": "someone"}), "community"
        )

    def test_metadata_can_name_the_source_outright(self):
        self.assertEqual(source_of("09-10-2026", {"source": "paper"}), "paper")

    def test_an_unknown_source_in_metadata_falls_back_to_the_date(self):
        self.assertEqual(source_of(PAPER_EVAL_DATE, {"source": "nonsense"}), "paper")

    def test_generated_entries_carry_their_source(self):
        with tempfile.TemporaryDirectory() as directory:
            write_run(directory, PAPER_EVAL_DATE, "openai", "paper-model", (5, 4))
            write_run(directory, "09-10-2026", "openai", "new-model", (6, 5))
            write_run(
                directory,
                "09-10-2026",
                "novamine",
                "submitted-model",
                (7, 6),
                metadata={"submitted_by": "someone", "authors": "Someone et al."},
            )
            models = run_generator(directory)

        sources = {m["variant"]: m["source"] for m in models}
        self.assertEqual(
            sources,
            {
                "paper-model": "paper",
                "new-model": "authors",
                "submitted-model": "community",
            },
        )

    def test_output_declares_the_source_labels_and_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            write_run(directory, PAPER_EVAL_DATE, "openai", "paper-model", (5, 4))
            write_run(directory, "09-10-2026", "openai", "new-model", (6, 5))
            run_generator(directory)
            written = json.loads(
                (Path(directory) / "leaderboard_data.json").read_text()
            )

        counts = {s["id"]: s["count"] for s in written["sources"]}
        self.assertEqual(counts, {"paper": 1, "authors": 1, "community": 0})
        self.assertEqual(
            [s["id"] for s in written["sources"]],
            ["paper", "authors", "community"],
        )
        self.assertEqual(
            [s["label"] for s in written["sources"]],
            ["Paper", "Authors", "Community"],
        )


class LeaderboardTests(unittest.TestCase):
    def test_latest_results_are_used_for_weighted_scores(self):
        original_dir = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            for date, curated, wildchat in [
                ("01-01-2025", (1, 2), (1, 2)),
                ("01-01-2026", (9, 8), (8, 6)),
            ]:
                for dataset, (distinct, utility) in [
                    ("curated", curated),
                    ("wildchat", wildchat),
                ]:
                    path = (
                        Path(directory)
                        / "eval"
                        / date
                        / dataset
                        / "openai"
                        / "test-model"
                    )
                    path.mkdir(parents=True)
                    (path / "summary.json").write_text(
                        json.dumps(
                            {
                                "mean_distinct": distinct,
                                "mean_utility": utility,
                            }
                        )
                    )
            try:
                os.chdir(directory)
                with contextlib.redirect_stdout(io.StringIO()):
                    models = generate_leaderboard_data()
            finally:
                os.chdir(original_dir)
            self.assertEqual(len(models), 1)
            self.assertEqual(models[0]["date"], "2026-01-01")
            self.assertEqual(models[0]["distinct"], 8.09)
            self.assertEqual(models[0]["utility"], 6.18)


if __name__ == "__main__":
    unittest.main()
