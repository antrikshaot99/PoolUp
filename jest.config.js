// jest.config.js
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['dotenv/config'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/e2e.test.js',
    '/tests/browser_chat.test.js',
  ],
  testTimeout: 20000,
};