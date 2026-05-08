const fs = require('fs');
const path = require('path');
const vm = require('vm');

const themesDir = path.join(__dirname, 'themes');
const files = fs.readdirSync(themesDir).filter(f => f.endsWith('.theme.js'));

for (const file of files) {
  const src = fs.readFileSync(path.join(themesDir, file), 'utf-8');
  let captured = null;
  
  const sandbox = {
    window: {
      __themeRegistry: {
        register: (theme) => {
          captured = {
            id: theme.id,
            name: theme.name,
            defaults: theme.defaults || {},
            schema: (theme.schema || []).map(s => {
              const clean = {};
              for (const k of Object.keys(s)) {
                if (typeof s[k] !== 'function') clean[k] = s[k];
              }
              return clean;
            })
          };
        }
      }
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    document: null,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    AudioContext: null,
    webkitAudioContext: null
  };

  try {
    const script = new vm.Script(src, { timeout: 1000 });
    script.runInNewContext(sandbox, { timeout: 1000 });
  } catch (e) {
    console.error(`FAILED: ${file}:`, e.message);
    continue;
  }

  console.log(`\n=== ${file} ===`);
  if (captured) {
    console.log('  id:', captured.id);
    console.log('  name:', captured.name);
    console.log('  defaults:', JSON.stringify(captured.defaults));
    console.log('  schema:', captured.schema.length, 'entries');
    for (const s of captured.schema) {
      console.log('    -', JSON.stringify(s));
    }
  } else {
    console.log('  NOT CAPTURED');
  }
}
