"""Boundary tests for the repository source-file line limit."""

import tempfile
import unittest
from pathlib import Path

from check_source_lines import MAX_LINES, violations


class SourceLineLimitTests(unittest.TestCase):
    def test_accepts_exactly_500_lines_and_rejects_501(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            allowed = root / "api" / "app" / "allowed.py"
            excessive = root / "whatsapp" / "src" / "excessive.ts"
            allowed.parent.mkdir(parents=True)
            excessive.parent.mkdir(parents=True)
            allowed.write_text("line\n" * MAX_LINES, encoding="utf-8")
            excessive.write_text("line\n" * MAX_LINES + "last line", encoding="utf-8")

            self.assertEqual(
                violations(
                    root,
                    [Path("api/app/allowed.py"), Path("whatsapp/src/excessive.ts")],
                ),
                [(Path("whatsapp/src/excessive.ts"), MAX_LINES + 1)],
            )

    def test_skips_generated_client_and_non_code_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            generated = root / "web" / "src" / "lib" / "api-types.ts"
            documentation = root / "README.md"
            generated.parent.mkdir(parents=True)
            generated.write_text(
                "type X = string;\n" * (MAX_LINES + 1), encoding="utf-8"
            )
            documentation.write_text("line\n" * (MAX_LINES + 1), encoding="utf-8")

            self.assertEqual(
                violations(root, [Path("web/src/lib/api-types.ts"), Path("README.md")]),
                [],
            )


if __name__ == "__main__":
    unittest.main()
