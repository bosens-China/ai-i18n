# React Best Practices

Complete guidance and code examples live in [`rules/`](./rules/). This file indexes them by topic.

## Eliminating Waterfalls

- [Prevent Waterfall Chains in API Routes](./rules/async-api-routes.md)
- [Check Cheap Conditions Before Async Flags](./rules/async-cheap-condition-before-await.md)
- [Defer Await Until Needed](./rules/async-defer-await.md)
- [Dependency-Based Parallelization](./rules/async-dependencies.md)
- [Promise.all() for Independent Operations](./rules/async-parallel.md)
- [Strategic Suspense Boundaries](./rules/async-suspense-boundaries.md)

## Bundle Size Optimization

- [Prefer Statically Analyzable Paths](./rules/bundle-analyzable-paths.md)
- [Avoid Barrel File Imports](./rules/bundle-barrel-imports.md)
- [Conditional Module Loading](./rules/bundle-conditional.md)
- [Defer Non-Critical Third-Party Libraries](./rules/bundle-defer-third-party.md)
- [Dynamic Imports for Heavy Components](./rules/bundle-dynamic-imports.md)
- [Preload Based on User Intent](./rules/bundle-preload.md)

## Server-Side Performance

- [Use after() for Non-Blocking Operations](./rules/server-after-nonblocking.md)
- [Authenticate Server Actions Like API Routes](./rules/server-auth-actions.md)
- [Cross-Request LRU Caching](./rules/server-cache-lru.md)
- [Per-Request Deduplication with React.cache()](./rules/server-cache-react.md)
- [Avoid Duplicate Serialization in RSC Props](./rules/server-dedup-props.md)
- [Hoist Static I/O to Module Level](./rules/server-hoist-static-io.md)
- [Avoid Shared Module State for Request Data](./rules/server-no-shared-module-state.md)
- [Parallel Data Fetching with Component Composition](./rules/server-parallel-fetching.md)
- [Parallel Nested Data Fetching](./rules/server-parallel-nested-fetching.md)
- [Minimize Serialization at RSC Boundaries](./rules/server-serialization.md)

## Client-Side Data Fetching

- [Deduplicate Global Event Listeners](./rules/client-event-listeners.md)
- [Version and Minimize localStorage Data](./rules/client-localstorage-schema.md)
- [Use Passive Event Listeners for Scrolling Performance](./rules/client-passive-event-listeners.md)
- [Use SWR for Automatic Deduplication](./rules/client-swr-dedup.md)

## Re-render Optimization

- [Defer State Reads to Usage Point](./rules/rerender-defer-reads.md)
- [Narrow Effect Dependencies](./rules/rerender-dependencies.md)
- [Calculate Derived State During Rendering](./rules/rerender-derived-state-no-effect.md)
- [Subscribe to Derived State](./rules/rerender-derived-state.md)
- [Use Functional setState Updates](./rules/rerender-functional-setstate.md)
- [Use Lazy State Initialization](./rules/rerender-lazy-state-init.md)
- [Extract Default Non-primitive Parameter Value from Memoized Component to Constant](./rules/rerender-memo-with-default-value.md)
- [Extract to Memoized Components](./rules/rerender-memo.md)
- [Put Interaction Logic in Event Handlers](./rules/rerender-move-effect-to-event.md)
- [Don't Define Components Inside Components](./rules/rerender-no-inline-components.md)
- [Do not wrap a simple expression with a primitive result type in useMemo](./rules/rerender-simple-expression-in-memo.md)
- [Split Combined Hook Computations](./rules/rerender-split-combined-hooks.md)
- [Use Transitions for Non-Urgent Updates](./rules/rerender-transitions.md)
- [Use useDeferredValue for Expensive Derived Renders](./rules/rerender-use-deferred-value.md)
- [Use useRef for Transient Values](./rules/rerender-use-ref-transient-values.md)

## Rendering Performance

- [Use Activity Component for Show/Hide](./rules/rendering-activity.md)
- [Animate SVG Wrapper Instead of SVG Element](./rules/rendering-animate-svg-wrapper.md)
- [Use Explicit Conditional Rendering](./rules/rendering-conditional-render.md)
- [CSS content-visibility for Long Lists](./rules/rendering-content-visibility.md)
- [Hoist Static JSX Elements](./rules/rendering-hoist-jsx.md)
- [Prevent Hydration Mismatch Without Flickering](./rules/rendering-hydration-no-flicker.md)
- [Suppress Expected Hydration Mismatches](./rules/rendering-hydration-suppress-warning.md)
- [Use React DOM Resource Hints](./rules/rendering-resource-hints.md)
- [Use defer or async on Script Tags](./rules/rendering-script-defer-async.md)
- [Optimize SVG Precision](./rules/rendering-svg-precision.md)
- [Use useTransition Over Manual Loading States](./rules/rendering-usetransition-loading.md)

## JavaScript Performance

- [Avoid Layout Thrashing](./rules/js-batch-dom-css.md)
- [Cache Repeated Function Calls](./rules/js-cache-function-results.md)
- [Cache Property Access in Loops](./rules/js-cache-property-access.md)
- [Cache Storage API Calls](./rules/js-cache-storage.md)
- [Combine Multiple Array Iterations](./rules/js-combine-iterations.md)
- [Early Return from Functions](./rules/js-early-exit.md)
- [Use flatMap to Map and Filter in One Pass](./rules/js-flatmap-filter.md)
- [Hoist RegExp Creation](./rules/js-hoist-regexp.md)
- [Build Index Maps for Repeated Lookups](./rules/js-index-maps.md)
- [Early Length Check for Array Comparisons](./rules/js-length-check-first.md)
- [Use Loop for Min/Max Instead of Sort](./rules/js-min-max-loop.md)
- [Defer Non-Critical Work with requestIdleCallback](./rules/js-request-idle-callback.md)
- [Use Set/Map for O(1) Lookups](./rules/js-set-map-lookups.md)
- [Use toSorted() Instead of sort() for Immutability](./rules/js-tosorted-immutable.md)

## Advanced Patterns

- [Do Not Put Effect Events in Dependency Arrays](./rules/advanced-effect-event-deps.md)
- [Store Event Handlers in Refs](./rules/advanced-event-handler-refs.md)
- [Initialize App Once, Not Per Mount](./rules/advanced-init-once.md)
- [useEffectEvent for Stable Callback Refs](./rules/advanced-use-latest.md)
