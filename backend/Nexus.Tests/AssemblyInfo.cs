// Bound disposable-database DDL churn on the shared local PostgreSQL instance.
// Concurrency inside each race/contention test remains unchanged.
[assembly: Xunit.CollectionBehavior("Nexus.Tests.WorkspaceCollectionFactory", "Nexus.Tests", MaxParallelThreads = 4)]
