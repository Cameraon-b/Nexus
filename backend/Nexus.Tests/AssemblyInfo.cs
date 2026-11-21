// Bound disposable-database DDL churn on the shared local PostgreSQL instance.
// Concurrency inside each race/contention test remains unchanged.
[assembly: Xunit.CollectionBehavior(MaxParallelThreads = 4)]
