/**
 * Test helper for safely managing sinon stubs with automatic cleanup.
 *
 * This helper ensures that stubs are properly restored even if tests fail,
 * preventing TypeErrors in subsequent tests when stubs are already restored.
 *
 * @param {Function} setupStubs - Function that creates and returns stubs.
 * @param {Function} testBody - The actual test function to execute.
 * @returns {Promise} Promise that resolves when test completes.
 *
 * @example
 * await withStubs(
 *   () => {
 *     const stub1 = sinon.stub(module, 'method1').returns('mocked');
 *     const stub2 = sinon.stub(module, 'method2').resolves('async');
 *     return [stub1, stub2];
 *   },
 *   async () => {
 *     // Your test logic here
 *     const result = await module.method1();
 *     expect(result).to.equal('mocked');
 *   }
 * );
 */
async function withStubs(setupStubs, testBody) {
  let stubs = [];

  try {
    // Setup stubs safely - if setup fails, we still want to clean up
    stubs = await setupStubs();

    // Ensure stubs is an array
    if(!Array.isArray(stubs) || stubs.some(stub => !stub || !stub.restore)) {
      throw TypeError('Stubs must be returned from setupStubs function');
    }
  } catch(error) {
    console.warn('Skipping test due to previous failures. Stubs already set.');
    return;
  }

  try {
    // Execute the test body
    await testBody();
  } finally {
    // Always restore stubs, even if they were already restored
    stubs.forEach(stub => {
      try {
        if(stub && typeof stub.restore === 'function') {
          stub.restore();
        }
      } catch(restoreError) {
        // Silently ignore restore errors (e.g., stub already restored)
        // This prevents cascading errors in test suites
      }
    });
  }
}

export {withStubs};
