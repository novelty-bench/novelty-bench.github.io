import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path

from generate_leaderboard_data import generate_leaderboard_data


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
