# Performance diagnosis

Use when the user requests startup overhead, slow-stage attribution or a repeatable plugin comparison.

1. Confirm the target Vite app(s), installed options and the user's metric: server listening, source
   transformation or browser rendering. Do not equate them. Existing `timing` diagnoses individual Dev
   stages; `performance` captures Dev / Build reports. Use the project's user documentation for options.
2. Enable `diagnostics.performance: true` for requested targets. Keep default `logs/performance`, or verify
   a requested directory is relative to Vite root, outside the protocol directory and ignored by Git.
   Preserve all unrelated framework, locale, Provider and Review configuration.
3. Reproduce the user's operation and wait for the report or close normally. A running span is evidence
   of unfinished work at snapshot time, not proof of a deadlock. Counts/totals include all completions;
   quantiles and detailed spans have bounded windows. State sample counts and truncation when interpreting.
4. Read `summaries` first, then relevant `spans` / `active`. Separate state queues from execution and Vite dependency loading from plugin CPU.
   Reports omit write/persistence spans; parent elapsed time still includes required I/O waits. Never sum
   nested/concurrent stage totals. A cache-hit count describes source analysis, not TM or browser cache. Compare the hit/miss groups
   separately; do not equate unchanged cache invalidation with a real HMR edit.
5. Do not infer persistence completion from these reports. Correlate Provider timings using `batchId`; do not read full model logs unless translation diagnosis
   needs them. Performance reports deliberately omit source/translation/error bodies and credentials.
6. For this repository's examples, use `pnpm examples:perf` to build and launch all three apps,
   then open pages to trigger transforms. Use `pnpm perf:examples --runs=5` for an isolated comparison;
   it builds current packages automatically. Per-example `dev:perf` requires a prior root build.
   Inspect `examples/README.md` for the precise baseline and exclusions. The runner creates isolated
   copies and three modes: no plugin, plugin with diagnostics off, plugin with profiling on.
   The no-plugin virtual module is a resolution placeholder, not a functional i18n Runtime.
   Never use benchmark modes for browser functional verification or claim first-paint measurements.
7. Report medians, raw-data location, environment, workload, absolute differences and uncertainty.
   A negative difference can be noise; do not clamp it to zero or claim optimization from one run.
   Do not add CI blocking thresholds until repeated baselines establish noise and acceptable budgets.

Do not write translations, overrides, generated catalogs or personal candidate caches to repair a
performance test. Use isolated fixtures for destructive cache experiments. When diagnostics are no
longer requested, remove the setting; preserve the user's explicit preference to keep example profiling
enabled. Do not remove old reports or other work products unless they are this run's temporary fixtures
or the user requests cleanup. MCP's tool contracts and write boundaries are unchanged.
