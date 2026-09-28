import unittest

from dbutil import compare_counts, quote_ident, quote_literal


class QuoteIdentTest(unittest.TestCase):
    def test_quotes_and_escapes(self) -> None:
        self.assertEqual(quote_ident("transactions"), '"transactions"')
        self.assertEqual(quote_ident('weird"name'), '"weird""name"')
        self.assertEqual(quote_literal("orcadom_db"), "'orcadom_db'")
        self.assertEqual(quote_literal("o'reilly"), "'o''reilly'")


class CompareCountsTest(unittest.TestCase):
    def test_equal_counts_pass(self) -> None:
        payload = {"public.transactions": 10, "public.users": 2}
        self.assertEqual(compare_counts(payload, payload), [])

    def test_mismatch_and_extra_tables_fail(self) -> None:
        diffs = compare_counts(
            {"public.transactions": 10, "public.users": 2},
            {"public.transactions": 9, "n8n.workflow_entity": 1},
        )
        self.assertIn("public.transactions: expected 10, got 9", diffs)
        self.assertIn("public.users: expected 2, got None", diffs)
        self.assertIn("n8n.workflow_entity: unexpected table with 1 rows", diffs)


if __name__ == "__main__":
    unittest.main()
