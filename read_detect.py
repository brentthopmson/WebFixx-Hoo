import json
from pathlib import Path

# In the new version of graphify, manifest.json is in graphify-out
manifest_path = Path('graphify-out/manifest.json')

if manifest_path.exists():
    try:
        data = json.loads(manifest_path.read_text(encoding='utf-8'))
        total_files = len(data.get('files', []))
        print(f"Corpus: {total_files} files")
        # You can add more detailed stats here if needed
    except Exception as e:
        print(f"Error reading manifest: {e}")
else:
    print("manifest.json not found in graphify-out. Run 'python -m graphify update .' first.")
