"""Pruebas de regresión sin red: python3 -B -m unittest discover -s scripts/backlog."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


class BacklogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)
        self.env = dict(os.environ)
        for key in ("PROJECT_TOKEN", "PROJECT_NUMBER", "GH_TOKEN", "DRY_RUN"):
            self.env.pop(key, None)
        self.env["PATH"] = str(self.folder) + os.pathsep + self.env["PATH"]
        self.log = self.folder / "calls"
        self.env["CALLS"] = str(self.log)
        self.env["MOCK_PR"] = json.dumps({
            "body": "Refs #12", "labels": [], "author": {"login": "developer"},
            "closingIssuesReferences": [], "files": [],
        })
        self.env["MOCK_COMMENTS"] = ""
        self.env["MOCK_EDIT_STATUS"] = "0"
        self.stub("gh", r'''#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$CALLS"
case "$1 $2" in
  "pr view") printf '%s\n' "$MOCK_PR" ;;
  "issue view") echo 'tipo:decision' ;;
  "issue edit")
    if [ "$MOCK_EDIT_STATUS" != 0 ]; then
      echo "'en-produccion' label not found" >&2
      exit "$MOCK_EDIT_STATUS"
    fi ;;
  "api --paginate") printf '%s\n' "$MOCK_COMMENTS" ;;
  "issue comment") ;;
  *) echo "Unexpected gh call: $*" >&2; exit 99 ;;
esac
''')
        self.stub("curl", "#!/bin/sh\nexit 22\n")

    def stub(self, name, content):
        path = self.folder / name
        path.write_text(content)
        path.chmod(0o755)

    def run_script(self, name, *args):
        return subprocess.run(
            ["bash", str(ROOT / "scripts/backlog" / name), *args],
            cwd=ROOT, env=self.env, text=True, capture_output=True, check=False,
        )

    def generate(self, items, text="prefacio\n<!-- backlog:inicio -->\nviejo\n<!-- backlog:fin -->\nepílogo\n", total=None):
        source = self.folder / "items.json"
        source.write_text(json.dumps({"items": items, "totalCount": len(items) if total is None else total}))
        target = self.folder / "BACKLOG.md"
        target.write_text(text)
        result = self.run_script("generar-backlog.sh", "--from-json", str(source), "--out", str(target))
        return result, target.read_text()

    def item(self, title="BKL-001 · Prueba", **fields):
        return {"content": {"type": "Issue", "number": 1, "title": title, "url": "https://example.invalid/1"}, **fields}

    def test_generator_preserves_surrounding_text_and_escapes_cells(self):
        result, text = self.generate([self.item("BKL-001 · Barra | y\nsalto", area="a|b", referencia="c\nd")])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(text.startswith("prefacio\n"))
        self.assertTrue(text.endswith("epílogo\n"))
        self.assertIn(r"Barra \| y salto", text)
        self.assertIn(r"a\|b", text)
        self.assertNotIn("viejo", text)

    def test_generator_keeps_titles_without_backlog_id(self):
        result, text = self.generate([self.item("Sin identificador")])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Sin identificador", text)

    def test_generator_orders_issues_and_ignores_drafts(self):
        result, text = self.generate([
            self.item("BKL-006 · Hecha", estado="Hecho"),
            self.item("BKL-005 · Revision", estado="En revisión"),
            self.item("BKL-004 · Pausa", estado="Pausada"),
            self.item("BKL-003 · Curso", estado="En curso"),
            {"content": {"type": "DraftIssue", "title": "Borrador"}},
            self.item("BKL-002 · Lista", estado="Listo para hacer", prioridad="P2"),
            self.item("BKL-001 · Primera", estado="Ideas", prioridad="P1"),
        ])
        self.assertEqual(result.returncode, 0, result.stderr)
        order = ["Primera", "Lista", "Curso", "Pausa", "Revision", "Hecha"]
        for earlier, later in zip(order, order[1:]):
            self.assertLess(text.index(earlier), text.index(later), text)
        self.assertNotIn("Borrador", text)

    def test_generator_maps_legacy_states_and_shows_agent_columns(self):
        result, text = self.generate([
            self.item(
                "BKL-007 · Descartada",
                estado="Descartado",
                zona=["docs", "api"],
                agente="cursor-docs-1",
                rama="chore/bkl",
            ),
            self.item("BKL-006 · Desplegada", estado="Desplegado"),
            self.item("BKL-005 · Fusionada", estado="Fusionado"),
            self.item("BKL-004 · Codex", estado="En Codex/PR"),
            self.item("BKL-003 · Spec", estado="Spec lista"),
            self.item("BKL-002 · Decision", estado="Decidir"),
            self.item("BKL-001 · Idea vieja", estado="Idea"),
        ])
        self.assertEqual(result.returncode, 0, result.stderr)
        order = ["Idea vieja", "Decision", "Spec", "Codex", "Fusionada", "Desplegada", "Descartada"]
        for earlier, later in zip(order, order[1:]):
            self.assertLess(text.index(earlier), text.index(later), text)
        for legacy in ("Idea |", "Decidir |", "Spec lista", "En Codex/PR", "Fusionado", "Desplegado", "Descartado"):
            self.assertNotIn(legacy, text)
        self.assertIn("Listo para hacer", text)
        self.assertIn("En curso", text)
        self.assertIn("Hecho", text)
        self.assertIn("| Zona | Agente | Rama |", text)
        self.assertIn("cursor-docs-1", text)
        self.assertIn("chore/bkl", text)
        self.assertIn("docs, api", text)

    def test_generator_rejects_truncated_input_without_writing(self):
        result, text = self.generate([], text="original", total=501)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(text, "original")

    def test_generator_rejects_broken_markers_without_writing(self):
        for text in ("<!-- backlog:inicio -->\n", "<!-- backlog:fin -->\n<!-- backlog:inicio -->\n"):
            with self.subTest(text=text):
                result, output = self.generate([], text=text)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(output, text)

    def test_generator_handles_empty_project_and_missing_option_value(self):
        result, text = self.generate([])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("0 elementos", result.stdout)
        self.assertIn("| ID |", text)
        result = self.run_script("generar-backlog.sh", "--out")
        self.assertEqual(result.returncode, 2)

    def test_missing_project_number_skips_check_without_network(self):
        result = self.run_script("sync.sh", "pr-check", "1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("::warning::", result.stdout)
        self.assertFalse(self.log.exists())

    def test_pr_requires_reference_and_records_decisions(self):
        self.env["PROJECT_NUMBER"] = "1"
        data = json.loads(self.env["MOCK_PR"])
        for body, closing, files, expected in (
            ("Sin referencia", [], [], 1),
            ("Refs #12", [], [], 1),
            ("Closes #12", [{"number": 12}], [], 1),
            ("Closes #12", [{"number": 12}], [{"path": "docs/backlog/DECISIONES.md"}], 0),
            ("Refs #12\n- [x] Cambia una decisión", [], [], 1),
        ):
            with self.subTest(body=body, files=files):
                data.update(body=body, closingIssuesReferences=closing, files=files)
                self.env["MOCK_PR"] = json.dumps(data)
                result = self.run_script("sync.sh", "pr-check", "1")
                self.assertEqual(result.returncode, expected, result.stdout + result.stderr)

    def test_merge_without_token_warns_and_deduplicates_comments(self):
        body = "Fusionada en #1 (`abcdef0`). Estado → Hecho."
        self.env["MOCK_PR"] = json.dumps({"body": "Closes #12", "mergeCommit": {"oid": "abcdef0"}, "closingIssuesReferences": [{"number": 12}]})
        self.env["MOCK_COMMENTS"] = body
        result = self.run_script("sync.sh", "pr-merged", "1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Sin PROJECT_TOKEN", result.stdout)
        self.assertNotIn("project ", self.log.read_text())
        self.assertNotIn("issue comment", self.log.read_text())
        self.assertNotIn("issue edit", self.log.read_text())

    def test_merge_comments_hecho_without_editing_labels(self):
        self.env["MOCK_EDIT_STATUS"] = "1"
        self.env["MOCK_PR"] = json.dumps({"body": "Closes #12", "mergeCommit": {"oid": "abcdef0"}, "closingIssuesReferences": [{"number": 12}]})
        result = self.run_script("sync.sh", "pr-merged", "1")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.log.read_text()
        self.assertIn("Estado → Hecho.", calls)
        self.assertNotIn("issue edit", calls)
        self.assertNotIn("falta una etiqueta", result.stdout)

    def test_unavailable_health_is_nonblocking_and_does_not_call_github(self):
        self.env["DRY_RUN"] = "1"
        result = self.run_script("sync.sh", "check-deploy")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("::warning::", result.stdout)
        self.assertFalse(self.log.exists())

    def test_deployed_merge_is_labeled_without_marking_done(self):
        self.stub("curl", "#!/bin/sh\necho '{\"commit\":\"abcdef0123456789\"}'\n")
        self.stub("gh", r'''#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$CALLS"
case "$1 $2" in
  "issue list") echo 12 ;;
  "issue view") echo 1 ;;
  "pr view") echo abcdef0 ;;
  "issue edit"|"issue comment") ;;
  "api --paginate") echo '' ;;
  *) exit 99 ;;
esac
''')
        # Git ancestry is stubbed: no network or real production commits.
        self.stub("git", "#!/bin/sh\nexit 0\n")
        result = self.run_script("sync.sh", "check-deploy")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        calls = self.log.read_text()
        self.assertIn("--add-label en-produccion", calls)
        self.assertIn("no cambia el Estado", calls)
        self.assertIn("issue comment", calls)
        self.assertNotIn("project item-edit", calls)
        self.assertNotIn("verificado-prod --", calls)

    def test_dry_run_never_writes_labels_comments_or_project(self):
        self.env["DRY_RUN"] = "1"
        self.env["MOCK_PR"] = json.dumps({"body": "Closes #12", "mergeCommit": {"oid": "abcdef0"}, "closingIssuesReferences": [{"number": 12}]})
        result = self.run_script("sync.sh", "pr-merged", "1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("[simulación]", result.stdout)
        calls = self.log.read_text()
        self.assertNotIn("issue edit", calls)
        self.assertNotIn("issue comment", calls)
        self.assertNotIn("project item-edit", calls)

    def test_auth_errors_are_not_ignored_as_missing_labels(self):
        self.stub("gh", r'''#!/usr/bin/env bash
if [ "$1 $2" = "pr view" ]; then
  printf '%s\n' "$MOCK_PR"
else
  echo 'HTTP 403: Resource not accessible' >&2
  exit 1
fi
''')
        self.env["MOCK_PR"] = json.dumps({"body": "Closes #12", "mergeCommit": {"oid": "abcdef0"}, "closingIssuesReferences": [{"number": 12}]})
        result = self.run_script("sync.sh", "pr-merged", "1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("403", result.stderr)

    def test_generator_uses_viewer_alias_for_own_project(self):
        self.env["PROJECT_NUMBER"] = "1"
        self.stub("gh", r'''#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CALLS"
case "$1 $2" in
  "api user") echo povedica ;;
  "project item-list")
    case "$*" in
      *"--owner @me"*) echo '{"items":[],"totalCount":0}' ;;
      *) echo 'unknown owner type' >&2; exit 1 ;;
    esac ;;
  *) exit 99 ;;
esac
''')
        result = self.run_script("generar-backlog.sh", "--out", str(self.folder / "live.md"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--owner @me", self.log.read_text())

    def test_missing_project_warning_is_valid_under_macos_bash(self):
        self.stub("gh", "#!/bin/sh\nprintf ''\n")
        result = self.run_script("generar-backlog.sh", "--out", str(self.folder / "missing.md"))
        self.assertEqual(result.returncode, 1)
        self.assertIn("No encuentro el Project", result.stderr)
        self.assertNotIn("unbound variable", result.stderr)

    def test_missing_project_field_warns_without_unbound_variable(self):
        self.env["PROJECT_NUMBER"] = "1"
        self.env["PROJECT_TOKEN"] = "test-only-token"
        self.env["MOCK_PR"] = json.dumps({"body": "Closes #12", "mergeCommit": {"oid": "abcdef0"}, "closingIssuesReferences": [{"number": 12}]})
        self.stub("gh", r'''#!/usr/bin/env bash
case "$1 $2" in
  "pr view") printf '%s\n' "$MOCK_PR" ;;
  "api user") echo povedica ;;
  "project view") echo PVT_test ;;
  "project field-list") echo '{"fields":[]}' ;;
  "project item-list"|"issue edit"|"issue comment"|"api --paginate") ;;
  *) exit 99 ;;
esac
''')
        result = self.run_script("sync.sh", "pr-merged", "1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("no encuentro el item", result.stdout)
        self.assertNotIn("unbound variable", result.stderr)

    def test_merge_does_not_move_paused_issue_and_sets_hecho_otherwise(self):
        self.env["PROJECT_NUMBER"] = "1"
        self.env["PROJECT_TOKEN"] = "test-only-token"
        self.env["MOCK_PR"] = json.dumps({
            "body": "Closes #12",
            "mergeCommit": {"oid": "abcdef0123456789"},
            "closingIssuesReferences": [{"number": 12}],
        })
        script = r'''#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$CALLS"
case "$1 $2" in
  "pr view") printf '%s\n' "$MOCK_PR" ;;
  "api user") echo povedica ;;
  "project view") echo PVT_test ;;
  "project field-list") echo '{"fields":[{"id":"F1","name":"Status","options":[{"id":"O1","name":"Hecho"}]}]}' ;;
  "project item-list") printf '%s\n' "$MOCK_ITEM" ;;
  "issue edit"|"issue comment"|"api --paginate") ;;
  *) exit 99 ;;
esac
'''
        self.env["MOCK_ITEM"] = "PVTI_paused\tPausada"
        self.stub("gh", script)
        paused = self.run_script("sync.sh", "pr-merged", "1")
        self.assertEqual(paused.returncode, 0, paused.stdout + paused.stderr)
        self.assertIn("está en «Pausada»", paused.stdout)
        self.assertNotIn("project item-edit", self.log.read_text())

        self.log.write_text("")
        self.env["MOCK_ITEM"] = "PVTI_live\tEn curso"
        self.env["MOCK_COMMENTS"] = ""
        moving = self.run_script("sync.sh", "pr-merged", "1")
        self.assertEqual(moving.returncode, 0, moving.stdout + moving.stderr)
        calls = self.log.read_text()
        self.assertIn("project item-edit", calls)
        self.assertIn("--id PVTI_live", calls)
        self.assertIn("--single-select-option-id O1", calls)
        self.assertIn("→ Estado «Hecho»", moving.stdout)

    def test_check_blocks_when_closes_is_missing(self):
        self.env["PROJECT_NUMBER"] = "1"
        self.env["MOCK_PR"] = json.dumps({
            "body": "Refs #12\nSin línea de cierre.",
            "labels": [],
            "author": {"login": "developer"},
            "closingIssuesReferences": [],
            "files": [],
            "headRefName": "perf/f1",
        })
        result = self.run_script("sync.sh", "pr-check", "95")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("no tiene «Closes #N»", result.stdout)
        calls = self.log.read_text()
        self.assertIn("issue comment", calls)
        self.assertNotIn("project item-edit", calls)

    def test_check_accepts_fixes_as_first_line(self):
        self.env["PROJECT_NUMBER"] = "1"
        self.env["PROJECT_TOKEN"] = "test-only-token"
        self.env["MOCK_PR"] = json.dumps({
            "body": "Fixes #12\n",
            "labels": [],
            "author": {"login": "developer"},
            "closingIssuesReferences": [{"number": 12}],
            "files": [],
            "headRefName": "perf/f1",
        })
        self.env["MOCK_ITEM"] = "PVTI_ready\tListo para hacer\tcursor-api-1"
        self.stub("gh", self._project_pr_stub())
        result = self.run_script("sync.sh", "pr-check", "95")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Check de backlog OK", result.stdout)
        self.assertNotIn("tiene que ser la primera línea", result.stdout)

    def test_check_rejects_refs_keyword(self):
        self.env["PROJECT_NUMBER"] = "1"
        self.env["MOCK_PR"] = json.dumps({
            "body": "Refs #12\n",
            "labels": [],
            "author": {"login": "developer"},
            "closingIssuesReferences": [],
            "files": [],
            "headRefName": "perf/f1",
        })
        result = self.run_script("sync.sh", "pr-check", "95")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("no tiene «Closes #N»", result.stdout)

    def test_check_sets_branch_and_moves_ready_issue_when_body_closes(self):
        self.env["PROJECT_NUMBER"] = "1"
        self.env["PROJECT_TOKEN"] = "test-only-token"
        self.env["MOCK_PR"] = json.dumps({
            "body": "Closes #12\n",
            "labels": [],
            "author": {"login": "developer"},
            "closingIssuesReferences": [{"number": 12}],
            "files": [],
            "headRefName": "perf/f1",
        })
        self.env["MOCK_ITEM"] = "PVTI_ready\tListo para hacer\tcursor-api-1"
        self.stub("gh", self._project_pr_stub())
        result = self.run_script("sync.sh", "pr-check", "95")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        calls = self.log.read_text()
        self.assertIn("--text perf/f1", calls)
        self.assertIn("--field-id FRAMA", calls)
        self.assertIn("--single-select-option-id OCURSO", calls)
        self.assertNotIn("Agente está vacío", result.stdout)

    def test_check_warns_when_agent_is_empty_and_does_not_fail(self):
        self.env["PROJECT_NUMBER"] = "1"
        self.env["PROJECT_TOKEN"] = "test-only-token"
        self.env["MOCK_PR"] = json.dumps({
            "body": "Closes #102\n",
            "labels": [],
            "author": {"login": "developer"},
            "closingIssuesReferences": [{"number": 102}],
            "files": [],
            "headRefName": "perf/f1",
        })
        self.env["MOCK_ITEM"] = "PVTI_open\tEn curso\t"
        self.stub("gh", self._project_pr_stub())
        result = self.run_script("sync.sh", "pr-check", "95")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Agente está vacío", result.stdout)
        calls = self.log.read_text()
        self.assertIn("--text perf/f1", calls)
        self.assertIn("issue comment", calls)
        self.assertNotIn("--single-select-option-id", calls)

    def _project_pr_stub(self):
        return r'''#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$CALLS"
case "$1 $2" in
  "pr view") printf '%s\n' "$MOCK_PR" ;;
  "api user") echo povedica ;;
  "project view") echo PVT_test ;;
  "project field-list") echo '{"fields":[{"id":"FSTATUS","name":"Status","options":[{"id":"OCURSO","name":"En curso"}]},{"id":"FRAMA","name":"Rama"}]}' ;;
  "project item-list") printf '%s\n' "$MOCK_ITEM" ;;
  "project item-edit"|"issue comment"|"api --paginate"|"issue view") ;;
  *) echo "Unexpected gh call: $*" >&2; exit 99 ;;
esac
'''

    def test_invalid_health_commit_never_reaches_git(self):
        self.stub("curl", "#!/bin/sh\necho '{\"commit\":\"--invalid\"}'\n")
        result = self.run_script("sync.sh", "check-deploy")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("SHA válido", result.stdout)
        self.assertFalse(self.log.exists())


if __name__ == "__main__":
    unittest.main()
