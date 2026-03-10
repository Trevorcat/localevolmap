# Client Template Refresh Design

## Goal

Ship repository-scoped, reusable client configuration templates for Cursor, Claude Code, Kimi, and OpenCode without mutating any contributor's local machine settings.

## Decision

Use checked-in template files with placeholder paths, placeholder hosts, and explicit replacement notes in the docs. Keep project-root ad hoc configs out of the published repo unless they are themselves reusable templates.

## Scope

- Refresh repository templates for `Cursor` and `Claude Code`
- Add or normalize repository templates for `Kimi` and `OpenCode`
- Update docs so deployers know which files to copy and which placeholders to replace
- Extend docs tests so client coverage does not drift

## Non-Goals

- Do not modify any personal global config under user home directories
- Do not add remote MCP-over-HTTP support in this change
- Do not turn placeholder templates into environment-specific production configs
