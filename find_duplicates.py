import os
import hashlib
import shutil
import sys

def get_hash(filepath):
    hasher = hashlib.md5()
    try:
        with open(filepath, 'rb') as f:
            while chunk := f.read(8192):
                hasher.update(chunk)
        return hasher.hexdigest()
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return None

def main(directory):
    discarded_dir = os.path.join(directory, 'discarded')
    if not os.path.exists(discarded_dir):
        os.makedirs(discarded_dir)

    hashes = {}
    moved_count = 0
    total_files = 0
    
    for filename in os.listdir(directory):
        filepath = os.path.join(directory, filename)
        
        if not os.path.isfile(filepath):
            continue
            
        if filename.lower().endswith('.json') or filename.lower().endswith('.py'):
            continue 
            
        total_files += 1
        
        file_hash = get_hash(filepath)
        if file_hash is None:
            continue
            
        if file_hash in hashes:
            # move to discarded
            target_path = os.path.join(discarded_dir, filename)
            try:
                shutil.move(filepath, target_path)
                moved_count += 1
            except Exception as e:
                print(f"Error moving {filename}: {e}")
        else:
            hashes[file_hash] = filename
            
    print(f"Scanned {total_files} files.")
    print(f"Moved {moved_count} duplicate files to {discarded_dir}")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        main(sys.argv[1])
    else:
        print("Please provide a directory")
