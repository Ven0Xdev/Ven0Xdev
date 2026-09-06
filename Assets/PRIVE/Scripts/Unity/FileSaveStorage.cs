using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;
using Prive.Save;

namespace Prive.Unity
{
    /// <summary>
    /// Stores saves as UTF-8 files under <see cref="Application.persistentDataPath"/>.
    /// </summary>
    /// <remarks>
    /// Writes go to a temporary file which then replaces the target, so a crash or a killed
    /// app mid-write cannot leave a half-written save. Losing a session is bad; losing the
    /// whole career because the process died during an autosave is unacceptable.
    /// </remarks>
    public sealed class FileSaveStorage : ISaveStorage
    {
        private const string Extension = ".privesave";
        private const string TempExtension = ".tmp";

        private readonly string _directory;

        public FileSaveStorage(string subdirectory = "Saves")
        {
            _directory = Path.Combine(Application.persistentDataPath, subdirectory);
        }

        public string Directory { get { return _directory; } }

        public bool Exists(string slotId)
        {
            return File.Exists(PathFor(slotId));
        }

        public void Write(string slotId, string payload)
        {
            System.IO.Directory.CreateDirectory(_directory);

            string target = PathFor(slotId);
            string temporary = target + TempExtension;

            File.WriteAllText(temporary, payload, new UTF8Encoding(false));

            if (File.Exists(target)) File.Delete(target);
            File.Move(temporary, target);
        }

        public string Read(string slotId)
        {
            string path = PathFor(slotId);
            if (!File.Exists(path)) return null;

            try
            {
                return File.ReadAllText(path, new UTF8Encoding(false));
            }
            catch (IOException e)
            {
                Debug.LogError("[PRIVE] Could not read save slot '" + slotId + "': " + e.Message);
                return null;
            }
        }

        public void Delete(string slotId)
        {
            string path = PathFor(slotId);
            if (File.Exists(path)) File.Delete(path);
        }

        public IEnumerable<string> ListSlots()
        {
            List<string> slots = new List<string>();
            if (!System.IO.Directory.Exists(_directory)) return slots;

            string[] files = System.IO.Directory.GetFiles(_directory, "*" + Extension);
            for (int i = 0; i < files.Length; i++)
            {
                slots.Add(Path.GetFileNameWithoutExtension(files[i]));
            }

            return slots;
        }

        private string PathFor(string slotId)
        {
            if (string.IsNullOrEmpty(slotId)) throw new ArgumentException("slotId is required", "slotId");
            return Path.Combine(_directory, SanitiseSlotId(slotId) + Extension);
        }

        /// <summary>Keeps a slot id safe to use as a file name on every target platform.</summary>
        private static string SanitiseSlotId(string slotId)
        {
            StringBuilder builder = new StringBuilder(slotId.Length);

            for (int i = 0; i < slotId.Length; i++)
            {
                char c = slotId[i];
                bool safe = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
                            || (c >= '0' && c <= '9') || c == '_' || c == '-';
                builder.Append(safe ? c : '_');
            }

            return builder.ToString();
        }
    }
}
