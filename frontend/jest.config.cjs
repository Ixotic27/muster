module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  setupFiles: ['<rootDir>/scripts/test-polyfills.cjs'],
  moduleNameMapper: { '\\.(css|scss)$': '<rootDir>/scripts/style-mock.cjs' },
  transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
  clearMocks: true
};
