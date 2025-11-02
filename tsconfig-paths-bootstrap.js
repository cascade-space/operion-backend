/**
 * Bootstrap script for tsconfig-paths at runtime
 * This maps path aliases to the compiled dist directory instead of src
 */
const tsConfigPaths = require('tsconfig-paths');
const path = require('path');
const fs = require('fs');

// Read and parse tsconfig.json (supports comments)
function readTsConfig(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  // Strip single-line comments (// ...)
  const withoutComments = content.replace(/\/\/.*$/gm, '');
  // Strip multi-line comments (/* ... */)
  const cleaned = withoutComments.replace(/\/\*[\s\S]*?\*\//g, '');
  return JSON.parse(cleaned);
}

// Read the base tsconfig.json
const tsConfig = readTsConfig(path.resolve(__dirname, 'tsconfig.json'));

// Map paths from src/ to dist/ for runtime
// baseUrl is "./src", so we change it to "./dist" for runtime
const baseUrl = path.resolve(__dirname, './dist');
const paths = {};

// Map all @/* paths from src/ to dist/
Object.keys(tsConfig.compilerOptions.paths).forEach(key => {
  const pathValues = tsConfig.compilerOptions.paths[key];
  // Replace "./" with "./dist/" to point to compiled files
  paths[key] = pathValues.map(p => {
    // If path starts with "./", replace with "./dist/"
    // e.g., "./middleware/*" -> "./dist/middleware/*"
    return p.replace(/^\.\//, './dist/');
  });
});

// Register the paths
tsConfigPaths.register({
  baseUrl,
  paths
});

