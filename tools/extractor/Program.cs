using System.Text.RegularExpressions;
using CUE4Parse.Encryption.Aes;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.UE4.Versions;
using CUE4Parse_Conversion.Textures;
using Newtonsoft.Json;
using SkiaSharp;

// Headless Palworld asset extractor (replaces the FModel GUI).
//   palex list <regex> [max]      list mounted asset paths matching a pattern
//   palex json <regex> <outDir>   export matching packages as JSON
//   palex png  <regex> <outDir>   export matching textures as PNG
// Env: PAL_PAKS, PAL_USMAP

var paks = Environment.GetEnvironmentVariable("PAL_PAKS")
           ?? @"C:\Program Files (x86)\Steam\steamapps\common\Palworld\Pal\Content\Paks";
var usmap = Environment.GetEnvironmentVariable("PAL_USMAP")
            ?? @"C:\Users\David\Downloads\Mappings101.usmap";

if (args.Length < 1) { Console.Error.WriteLine("usage: palex <list|json|png> <regex> [outDir|max]"); return 1; }
var mode = args[0].ToLowerInvariant();
var pattern = args.Length > 1 ? args[1] : ".";
var arg3 = args.Length > 2 ? args[2] : null;

if (!Directory.Exists(paks)) { Console.Error.WriteLine($"Paks folder not found: {paks}"); return 2; }
if (!File.Exists(usmap)) { Console.Error.WriteLine($"usmap not found: {usmap}"); return 2; }

Console.Error.WriteLine($"paks : {paks}");
Console.Error.WriteLine($"usmap: {usmap}");

var provider = new DefaultFileProvider(paks, SearchOption.AllDirectories,
                                       new VersionContainer(EGame.GAME_UE5_1));
provider.Initialize();
provider.SubmitKey(new FGuid(), new FAesKey(new byte[32]));   // Palworld ships unencrypted
provider.MappingsContainer = new FileUsmapTypeMappingsProvider(usmap);
var mounted = provider.Mount();
Console.Error.WriteLine($"mounted {mounted} vfs · {provider.Files.Count} files");

var rx = new Regex(pattern, RegexOptions.IgnoreCase);
var hits = provider.Files.Keys.Where(k => rx.IsMatch(k)).OrderBy(k => k).ToList();
Console.Error.WriteLine($"matched {hits.Count} files");

if (mode == "list") {
    var max = int.TryParse(arg3, out var m) ? m : 400;
    foreach (var h in hits.Take(max)) Console.WriteLine(h);
    if (hits.Count > max) Console.Error.WriteLine($"...{hits.Count - max} more (raise the max arg)");
    return 0;
}

if (arg3 is null) { Console.Error.WriteLine("json/png need an output directory"); return 1; }
Directory.CreateDirectory(arg3);
int ok = 0, fail = 0;

foreach (var path in hits) {
    // one package spans .uasset/.uexp/.ubulk - only drive off the header file
    if (!path.EndsWith(".uasset") && !path.EndsWith(".umap")) continue;
    var name = Path.GetFileNameWithoutExtension(path);
    try {
        if (mode == "json") {
            var objs = provider.LoadPackage(path).GetExports().ToList();
            var outPath = Path.Combine(arg3, name + ".json");
            File.WriteAllText(outPath, JsonConvert.SerializeObject(objs, Formatting.Indented));
            Console.WriteLine($"{outPath}  ({objs.Count} objects)");
        } else if (mode == "png") {
            foreach (var obj in provider.LoadPackage(path).GetExports()) {
                if (obj is not UTexture tex) continue;
                // Decode -> CTexture (raw pixels), then Skia for the PNG encode
                var ctex = tex.Decode(ETexturePlatform.DesktopMobile);
                if (ctex is null) { fail++; continue; }
                using var bitmap = ctex.ToSkBitmap();
                using var img = SKImage.FromBitmap(bitmap);
                using var data = img.Encode(SKEncodedImageFormat.Png, 100);
                var outPath = Path.Combine(arg3, obj.Name + ".png");
                using var fs = File.OpenWrite(outPath);
                data.SaveTo(fs);
                Console.WriteLine($"{outPath}  {bitmap.Width}x{bitmap.Height}");
            }
        }
        ok++;
    } catch (Exception ex) {
        fail++;
        Console.Error.WriteLine($"  !! {name}: {ex.GetType().Name}: {ex.Message}");
    }
}
Console.Error.WriteLine($"done: {ok} ok, {fail} failed");
return 0;
