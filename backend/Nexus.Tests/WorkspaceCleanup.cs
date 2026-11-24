using System.Collections.Concurrent;
using Xunit.Abstractions;
using Xunit.Sdk;

namespace Nexus.Tests;

// C# await-using can replace a body exception with a DisposeAsync exception.
// Report cleanup errors separately at collection teardown instead, preserving both failures.
public sealed class WorkspaceCleanup : IDisposable
{
    public static WorkspaceCleanup Shared { get; } = new();
    private readonly ConcurrentQueue<Exception> Failures = new();
    public async Task Capture(Func<Task> cleanup, string resource)
    {
        try { await cleanup(); }
        catch { Failures.Enqueue(new InvalidOperationException($"Test workspace cleanup failed: {resource}.")); }
    }
    public void ThrowPending()
    {
        var errors = new List<Exception>();
        while (Failures.TryDequeue(out var error)) errors.Add(error);
        if (errors.Count > 0) throw new AggregateException("Test workspace cleanup failed; inspect only the named disposable resources.", errors);
    }
    public void Dispose() => ThrowPending();
}

public sealed class WorkspaceCleanupFixture : IDisposable
{
    public void Dispose() => WorkspaceCleanup.Shared.ThrowPending();
}

[CollectionDefinition("Workspace cleanup")]
public sealed class WorkspaceCleanupDefinition : ICollectionFixture<WorkspaceCleanupFixture> { }

// Keep the existing per-class parallelism, adding a cleanup fixture to every collection.
public sealed class WorkspaceCollectionFactory : IXunitTestCollectionFactory
{
    private readonly ITestAssembly assembly;
    public WorkspaceCollectionFactory(ITestAssembly assembly, IMessageSink diagnosticMessageSink)
    {
        this.assembly = assembly;
    }
    private readonly ConcurrentDictionary<string, ITestCollection> collections = new();
    public string DisplayName => "Per-class with workspace cleanup verification";
    public ITestCollection Get(ITypeInfo testClass) => collections.GetOrAdd(testClass.Name,
        name => new TestCollection(assembly, Reflector.Wrap(typeof(WorkspaceCleanupDefinition)), name));
}
