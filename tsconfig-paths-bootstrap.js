/**
 * Bootstrap script for tsconfig-paths at runtime
 * This maps path aliases to the compiled dist directory instead of src
 */
const tsConfigPaths = require('tsconfig-paths');
const path = require('path');

// Hardcode the path mappings based on tsconfig.json
// These paths are mapped from src/ to dist/ at runtime
const baseUrl = path.resolve(__dirname, './dist');
const paths = {
  '@/*': ['./*'],
  '@/types/*': ['./types/*'],
  '@/models/*': ['./models/*'],
  '@/controllers/*': ['./controllers/*'],
  '@/middleware/*': ['./middleware/*'],
  '@/services/*': ['./services/*'],
  '@/utils/*': ['./utils/*'],
  '@/config/*': ['./config/*']
};

// Register the paths
tsConfigPaths.register({
  baseUrl,
  paths
});

