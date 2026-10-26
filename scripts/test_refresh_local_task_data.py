import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("task_copy", Path(__file__).with_name("refresh-local-task-data.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class TaskCopyTests(unittest.TestCase):
    def snapshot(self):
        data = {table: [] for table in MODULE.TABLES}
        data.update(schema_version=1, source_email="synthetic@example.test", owner_ids=["source-user"])
        data["projects"] = [{"id": "inbox", "owner_id": "source-user", "is_inbox": True}]
        data["tags"] = [{"id": "tag", "owner_id": "source-user", "name": "PERSONAL"}]
        data["tasks"] = [
            {"id": "parent", "owner_id": "source-user", "project_id": "inbox", "series_id": "series", "metadata": {"keep": "value"}},
            {"id": "child", "owner_id": "source-user", "project_id": "inbox", "parent_id": "parent", "assignee_id": "another-user"},
        ]
        data["task_tags"] = [{"task_id": "child", "tag_id": "tag"}]
        return data

    def test_remaps_relations_and_reuses_local_inbox_and_tags_stably(self):
        snapshot = self.snapshot()
        first, parents = MODULE.prepare_rows(snapshot, "local-user", [{"id": "local-tag", "name": "personal"}], "local-inbox", "source-key")
        second, _ = MODULE.prepare_rows(snapshot, "local-user", [{"id": "local-tag", "name": "personal"}], "local-inbox", "source-key")
        self.assertEqual(first, second)
        self.assertNotEqual(first["tasks"][0]["id"], "parent")
        self.assertEqual(parents["tasks"][first["tasks"][1]["id"]], first["tasks"][0]["id"])
        self.assertEqual(first["tasks"][1]["project_id"], "local-inbox")
        self.assertIsNone(first["tasks"][1]["assignee_id"])
        self.assertEqual(first["task_tags"][0]["tag_id"], "local-tag")
        self.assertEqual(first["tasks"][0]["metadata"]["keep"], "value")
        self.assertNotIn("local_data_copy", snapshot["tasks"][0]["metadata"])

    def test_refuses_wrong_account_cross_owner_and_missing_parent(self):
        snapshot = self.snapshot()
        with self.assertRaises(ValueError):
            MODULE.validate_snapshot(snapshot, "wrong@example.test")
        snapshot["tasks"][0]["owner_id"] = "foreign"
        with self.assertRaises(ValueError):
            MODULE.validate_snapshot(snapshot, "synthetic@example.test")
        snapshot = self.snapshot()
        snapshot["tasks"][1]["parent_id"] = "not-exported"
        with self.assertRaises(ValueError):
            MODULE.prepare_rows(snapshot, "local-user", [], None, "source-key")

    def test_source_query_is_read_only_and_exports_no_other_domains(self):
        sql = MODULE.source_sql("o'hara@example.test")
        self.assertTrue(sql.startswith("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;"))
        self.assertIn("o''hara@example.test", sql)
        for forbidden in ("password_hash", "google_refresh_token", "sessions", "habits", "external_events", "notification", "automations"):
            self.assertNotIn(forbidden, sql)

    def test_refuses_production_database_and_remote_docker_before_connecting(self):
        for database in ("production", "reflexionia", "ttd_staging"):
            with self.assertRaises(ValueError):
                MODULE.assert_local({"target_database": database})
        with patch.dict(MODULE.os.environ, {"DOCKER_HOST": "ssh://production"}):
            with self.assertRaises(ValueError):
                MODULE.assert_local({"target_database": "ttd_local"})

    def test_insert_uses_destination_columns_and_quotes_data_as_values(self):
        sql = MODULE.insert_sql("tasks", [{"id": "x", "title": "'); DELETE FROM users; --", "unknown_field": "ignored"}], ["id", "title"])
        self.assertNotIn("unknown_field", sql.split("VALUES")[0].split("FROM jsonb")[0])
        self.assertIn("''", sql)
        self.assertIn("ON CONFLICT (id) DO UPDATE", sql)
        self.assertNotIn("SELECT *", sql)

    def test_reimport_does_not_reset_local_versions_or_detach_parents(self):
        sql = MODULE.insert_sql("tasks", [{"id": "x", "title": "same", "version": 2, "parent_id": None}], ["id", "title", "version", "parent_id"])
        update = sql.split("DO UPDATE SET")[1]
        self.assertIn("IS DISTINCT FROM", update)
        self.assertNotIn('"version"=', update)
        self.assertNotIn('"parent_id"=', update)


if __name__ == "__main__":
    unittest.main()
