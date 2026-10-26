#!/usr/bin/env python3
"""Copy only a task graph from a read-only production snapshot to local Docker."""

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, UUID, uuid5

ROOT = Path(__file__).resolve().parents[1]
TABLES = (
    "folders", "projects", "columns", "tags", "tasks", "task_tags",
    "checklist_items", "task_links", "comments", "attachments",
)
IDENTIFIER = re.compile(r"^[a-z][a-z0-9_]*$")


def run(command, data=None):
    result = subprocess.run(command, input=data, capture_output=True, text=True)
    if result.returncode:
        # SQL errors can contain task contents. Keep private data out of terminal logs.
        raise RuntimeError(f"{command[0]} failed (exit {result.returncode}); no task contents logged")
    return result.stdout.strip()


def sql_string(value):
    return "'" + str(value).replace("'", "''") + "'"


def psql_command(container, database=""):
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]*", container):
        raise ValueError("Invalid database container")
    return ["docker", "exec", "-i", container, "sh", "-c",
            'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${1:-$POSTGRES_DB}"',
            "psql", database]


def local_query(profile, sql):
    return run(psql_command(profile["target_container"], profile["target_database"]), sql)


def assert_local(profile):
    database = profile["target_database"]
    if not re.fullmatch(r"ttd_[a-z0-9_]+", database) or database == "ttd_staging":
        raise ValueError("Destination must be an explicitly named local ttd_* development database")
    endpoint = os.environ.get("DOCKER_HOST")
    if not endpoint:
        context = json.loads(run(["docker", "context", "inspect"]))[0]
        endpoint = context["Endpoints"]["docker"]["Host"]
    if not endpoint.startswith(("unix://", "npipe://")):
        raise ValueError("A local Docker socket is required; remote Docker destinations are refused")
    info = json.loads(run(["docker", "inspect", profile["target_container"]]))[0]
    if not info["State"]["Running"] or not info["Config"]["Image"].startswith("postgres:"):
        raise ValueError("Destination must be a running local PostgreSQL container")


def source_sql(email):
    owner = f"SELECT id FROM users WHERE email={sql_string(email)} AND deleted_at IS NULL"
    expressions = ["'schema_version',1", "'source_email'," + sql_string(email),
                   "'owner_ids',(SELECT coalesce(jsonb_agg(id),'[]') FROM users WHERE id IN (" + owner + "))"]
    for table in TABLES:
        if table == "task_tags":
            condition = f"t.task_id IN (SELECT id FROM tasks WHERE owner_id IN ({owner}))"
        elif table in ("checklist_items", "task_links", "comments", "attachments"):
            condition = f"t.owner_id IN ({owner}) AND t.task_id IN (SELECT id FROM tasks WHERE owner_id IN ({owner}))"
        else:
            condition = f"t.owner_id IN ({owner})"
        expression = "to_jsonb(t) - 'search_vector'" if table == "tasks" else "to_jsonb(t)"
        expressions.append(f"'{table}',(SELECT coalesce(jsonb_agg({expression}),'[]') FROM {table} t WHERE {condition})")
    return ("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
            "SET LOCAL standard_conforming_strings=on;\nSET LOCAL statement_timeout='60s';\nSELECT jsonb_build_object(" + ",".join(expressions) + ");\nCOMMIT;\n")


def read_source(profile):
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.@-]*", profile["source_host"]):
        raise ValueError("Invalid source SSH host")
    command = psql_command(profile["source_container"], profile.get("source_database", ""))
    ssh = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10"]
    if profile.get("ssh_identity"):
        ssh += ["-i", str(Path(profile["ssh_identity"]).expanduser()), "-o", "IdentitiesOnly=yes"]
    # The only remote command is psql. The entire remote transaction is READ ONLY.
    return json.loads(run(ssh + [profile["source_host"], shlex.join(command)], source_sql(profile["source_email"])))


def validate_snapshot(snapshot, email):
    if snapshot.get("schema_version") != 1 or snapshot.get("source_email") != email:
        raise ValueError("Snapshot version or source account mismatch")
    owners = snapshot.get("owner_ids", [])
    if len(owners) != 1:
        raise ValueError("Exactly one matching production account is required")
    owner = owners[0]
    for table in TABLES:
        if not isinstance(snapshot.get(table), list):
            raise ValueError(f"Missing task graph table: {table}")
        for row in snapshot[table]:
            if table != "task_tags" and row.get("owner_id") != owner:
                raise ValueError("Cross-owner data refused")
    if not snapshot["tasks"]:
        raise ValueError("Empty task snapshots are refused")
    return owner


def prepare_rows(snapshot, target, existing_tags, existing_inbox, source_key):
    rows = copy.deepcopy({table: snapshot[table] for table in TABLES})
    namespace = uuid5(NAMESPACE_URL, "tick-tack-done:local-tasks:" + target + ":" + source_key)
    maps = {table: {r["id"]: str(uuid5(namespace, table + ":" + r["id"])) for r in rows[table]}
            for table in TABLES if table != "task_tags"}
    by_name = {r["name"].casefold(): r["id"] for r in existing_tags}
    for tag in rows["tags"]:
        if tag["name"].casefold() in by_name:
            maps["tags"][tag["id"]] = by_name[tag["name"].casefold()]
    for project in rows["projects"]:
        if project.get("is_inbox") and project.get("deleted_at") is None and existing_inbox:
            maps["projects"][project["id"]] = existing_inbox

    def linked(table, value):
        if value is None:
            return None
        if value not in maps[table]:
            raise ValueError(f"Missing {table} dependency in source snapshot")
        return maps[table][value]

    parents = {"tasks": {}, "tags": {}}
    for table in TABLES:
        for row in rows[table]:
            if "id" in row:
                row["id"] = maps[table][row["id"]]
            if "owner_id" in row:
                row["owner_id"] = target
            if table == "projects":
                row["folder_id"] = linked("folders", row.get("folder_id"))
            if table == "columns":
                row["project_id"] = linked("projects", row["project_id"])
            if table == "tasks":
                row["project_id"] = linked("projects", row["project_id"])
                row["column_id"] = linked("columns", row.get("column_id"))
                parent = linked("tasks", row.get("parent_id"))
                parents["tasks"][row["id"]] = parent
                row["parent_id"] = None
                row["created_by"] = target
                row["assignee_id"] = target if row.get("assignee_id") == snapshot["owner_ids"][0] else None
                if row.get("series_id"):
                    row["series_id"] = str(uuid5(namespace, "series:" + row["series_id"]))
                row["metadata"] = {**(row.get("metadata") or {}), "local_data_copy": {"source": source_key}}
            if table == "tags":
                parent = linked("tags", row.get("parent_id"))
                parents["tags"][row["id"]] = parent
                row["parent_id"] = None
            if "task_id" in row:
                row["task_id"] = linked("tasks", row["task_id"])
            if table == "task_tags":
                row["tag_id"] = linked("tags", row["tag_id"])
            if table == "comments":
                row["author_id"] = target
            if table == "attachments":
                row["uploaded_by"] = target
    return rows, parents


def insert_sql(table, rows, columns):
    if not rows:
        return ""
    fields = sorted(set(rows[0]) & set(columns))
    if not all(IDENTIFIER.fullmatch(f) for f in fields):
        raise ValueError("Invalid column name")
    names = ",".join('"' + f + '"' for f in fields)
    key = ["task_id", "tag_id"] if table == "task_tags" else ["id"]
    changes = [f for f in fields if f not in key]
    # Keep the destination's monotonic task version. Parent links are restored
    # separately after all rows exist, without detaching existing local parents.
    if table in ("tasks", "tags"):
        changes = [f for f in changes if f != "parent_id"]
    if table == "tasks":
        changes = [f for f in changes if f != "version"]
    conflict = ",".join(key)
    update = "DO NOTHING"
    if changes:
        update = "DO UPDATE SET " + ",".join(f'"{f}"=EXCLUDED."{f}"' for f in changes)
        current = ",".join(f'{table}."{f}"' for f in changes)
        incoming = ",".join(f'EXCLUDED."{f}"' for f in changes)
        update += f" WHERE ROW({current}) IS DISTINCT FROM ROW({incoming})"
    payload = sql_string(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
    return f"INSERT INTO {table}({names}) SELECT {names} FROM jsonb_populate_recordset(NULL::{table},{payload}::jsonb) ON CONFLICT ({conflict}) {update};\n"


def import_sql(rows, parents, columns, target, source_key):
    task_ids = ",".join(sql_string(row["id"]) + "::uuid" for row in rows["tasks"])
    sql = "BEGIN;\nSET LOCAL standard_conforming_strings=on;\nSET LOCAL lock_timeout='15s';\nSET LOCAL statement_timeout='60s';\n"
    sql += "SELECT pg_advisory_xact_lock(hashtextextended('local-task-copy:' || " + sql_string(target) + ",0));\n"
    for table in TABLES:
        if table != "task_tags" and rows[table]:
            ids = ",".join(sql_string(r["id"]) + "::uuid" for r in rows[table])
            sql += f"DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM {table} WHERE id IN ({ids}) AND owner_id <> {sql_string(target)}::uuid) THEN RAISE EXCEPTION 'Cross-owner collision'; END IF; END $guard$;\n"
        if table == "task_tags":
            sql += f"DELETE FROM task_tags WHERE task_id IN ({task_ids});\n"
        sql += insert_sql(table, rows[table], columns[table])
    for table, relations in parents.items():
        if relations:
            payload = sql_string(json.dumps(relations))
            sql += f"UPDATE {table} t SET parent_id=p.value::uuid FROM jsonb_each_text({payload}::jsonb) p WHERE t.id=p.key::uuid AND t.owner_id={sql_string(target)}::uuid AND t.parent_id IS DISTINCT FROM p.value::uuid;\n"
    sql += f"UPDATE tasks SET deleted_at=now() WHERE owner_id={sql_string(target)}::uuid AND metadata->'local_data_copy'->>'source'={sql_string(source_key)} AND id NOT IN ({task_ids}) AND deleted_at IS NULL;\n"
    sql += "COMMIT;\n"
    return sql


def private_json(path, document):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(document, stream, ensure_ascii=False)
        stream.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", type=Path, default=ROOT / ".env-config/local-task-data.json")
    parser.add_argument("--snapshot", type=Path, help="Use an already downloaded task-only snapshot")
    parser.add_argument("--apply", action="store_true", help="Back up and upsert the task graph into local Docker")
    args = parser.parse_args()
    os.umask(0o077)
    profile = json.loads(args.profile.read_text())
    assert_local(profile)
    snapshot = json.loads(args.snapshot.read_text()) if args.snapshot else read_source(profile)
    validate_snapshot(snapshot, profile["source_email"])
    target_rows = json.loads(local_query(profile, "BEGIN READ ONLY; SELECT coalesce(jsonb_agg(jsonb_build_object('id',id)),'[]') FROM users WHERE email=" + sql_string(profile["target_email"]) + " AND deleted_at IS NULL; COMMIT;"))
    if len(target_rows) != 1:
        raise ValueError("Exactly one existing local account is required; no production users are copied")
    target = str(UUID(target_rows[0]["id"]))
    tags = json.loads(local_query(profile, f"SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') FROM tags WHERE owner_id={sql_string(target)}::uuid;"))
    inbox = local_query(profile, f"SELECT id FROM projects WHERE owner_id={sql_string(target)}::uuid AND is_inbox=true AND deleted_at IS NULL;")
    source_key = hashlib.sha256((profile["source_host"] + ":" + profile["source_email"]).encode()).hexdigest()
    rows, parents = prepare_rows(snapshot, target, tags, inbox or None, source_key)
    summary = {table: len(rows[table]) for table in TABLES}
    if not args.apply:
        print(json.dumps({"mode": "preview", "counts": summary, "destination": profile["target_database"]}))
        return
    folder = ROOT / "backups/task-data" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    folder.mkdir(parents=True, mode=0o700)
    private_json(folder / "source-tasks.json", snapshot)
    # Back up the complete local database first; never dump the production database.
    backup = ["docker", "exec", profile["target_container"], "sh", "-c",
              'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$1"', "backup", profile["target_database"]]
    with (folder / "local-before.dump").open("xb") as stream:
        result = subprocess.run(backup, stdout=stream, stderr=subprocess.PIPE)
    if result.returncode or not (folder / "local-before.dump").stat().st_size:
        raise RuntimeError("Local backup failed; import refused")
    with (folder / "local-before.dump").open("rb") as stream:
        checked = subprocess.run(["docker", "exec", "-i", profile["target_container"], "pg_restore", "--list"], stdin=stream, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if checked.returncode:
        raise RuntimeError("Local backup verification failed; import refused")
    schema = json.loads(local_query(profile, "SELECT jsonb_object_agg(table_name,fields) FROM (SELECT table_name,jsonb_agg(column_name) fields FROM information_schema.columns WHERE table_schema='public' AND is_generated='NEVER' GROUP BY table_name) c;"))
    local_query(profile, import_sql(rows, parents, schema, target, source_key))
    actual = json.loads(local_query(profile, "SELECT jsonb_build_object('tasks',count(*),'active',count(*) FILTER(WHERE status='active' AND deleted_at IS NULL),'deleted',count(*) FILTER(WHERE deleted_at IS NOT NULL)) FROM tasks WHERE owner_id=" + sql_string(target) + "::uuid AND metadata->'local_data_copy'->>'source'=" + sql_string(source_key) + ";"))
    private_json(folder / "manifest.json", {"counts": summary, "imported_tasks": actual, "destination": profile["target_database"], "credentials_copied": False})
    print(json.dumps({"mode": "applied", "counts": summary, "imported_tasks": actual, "private_backup": str(folder)}))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, OSError) as error:
        print(f"Task copy failed: {error}", file=sys.stderr)
        sys.exit(1)
