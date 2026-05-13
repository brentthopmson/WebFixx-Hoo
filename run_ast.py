import sys
import json
from graphify.extract import collect_files, extract
from pathlib import Path

# Load from graphify-out/manifest.json or detect.json if we had one
# Since we used 'graphify update .', let's check graphify-out/manifest.json
manifest_path = Path('graphify-out/manifest.json')
code_files = []

if manifest_path.exists():
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        # Manifest is a dict where keys are full paths
        for f in manifest.keys():
            if f.endswith(('.js', '.py', '.gs')):
                code_files.append(Path(f))
    except Exception as e:
        print(f"Error reading manifest: {e}")

if code_files:
    result = extract(code_files)
    Path('.graphify_ast.json').write_text(json.dumps(result, indent=2))
    print(f'AST: {len(result["nodes"])} nodes, {len(result["edges"])} edges')
else:
    Path('.graphify_ast.json').write_text(json.dumps({'nodes':[],'edges':[],'input_tokens':0,'output_tokens':0}))
    print('No code files found in manifest - skipping AST extraction')
