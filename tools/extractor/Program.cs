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
//   palex enum <regex>            dump enum value->name maps from the mappings
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

// The icon sets on disk are indexed (T_Icon_element_03, T_icon_palwork_07) with
// nothing in the assets to say which element or work type each index means.
// The .usmap carries the enums, so the ordering comes from the game rather than
// from guessing at UI screenshots.
if (mode == "enum") {
    var enums = provider.MappingsContainer?.MappingsForGame?.Enums;
    if (enums is null) { Console.Error.WriteLine("no enums in mappings"); return 2; }
    Console.Error.WriteLine($"{enums.Count} enums in mappings");
    foreach (var (name, values) in enums.Where(e => rx.IsMatch(e.Key)).OrderBy(e => e.Key)) {
        Console.WriteLine($"## {name}");
        foreach (var (idx, val) in values.OrderBy(v => v.Key)) Console.WriteLine($"{idx}\t{val}");
    }
    return 0;
}

var hits = provider.Files.Keys.Where(k => rx.IsMatch(k)).OrderBy(k => k).ToList();
Console.Error.WriteLine($"matched {hits.Count} files");

if (mode == "list") {
    var max = int.TryParse(arg3, out var m) ? m : 400;
    foreach (var h in hits.Take(max)) Console.WriteLine(h);
    if (hits.Count > max) Console.Error.WriteLine($"...{hits.Count - max} more (raise the max arg)");
    return 0;
}

// World Partition splits the level into ~20k One-File-Per-Actor packages with
// hashed names, so you can't select the ones you want by path. scan walks them
// all and keeps only the exports whose Type matches, writing a single array —
// the alternative is 20k JSON files to find a dozen actors.
//   palex scan <pathRegex> <typeRegex> <outFile>
if (mode == "scan") {
    if (args.Length < 4) { Console.Error.WriteLine("scan needs <pathRegex> <typeRegex> <outFile>"); return 1; }
    var typeRx = new Regex(args[2], RegexOptions.IgnoreCase);
    var outFile = args[3];
    // Keep every export of a package that contains a match, keyed by package
    // path. An actor's transform lives on a sibling SceneComponent addressed by
    // export index, so keeping the actor alone would throw away its position.
    var keep = new Dictionary<string, object>();
    int scanned = 0, scanFail = 0, kept = 0;
    foreach (var path in hits) {
        if (!path.EndsWith(".uasset") && !path.EndsWith(".umap")) continue;
        scanned++;
        if (scanned % 2000 == 0) Console.Error.WriteLine($"  scanned {scanned}, kept {kept}");
        try {
            var objs = provider.LoadPackage(path).GetExports().ToList();
            if (!objs.Any(o => typeRx.IsMatch(o.ExportType))) continue;
            keep[path] = objs;
            kept++;
        } catch { scanFail++; }
    }
    File.WriteAllText(outFile, JsonConvert.SerializeObject(keep, Formatting.Indented));
    Console.Error.WriteLine($"scanned {scanned} packages ({scanFail} unreadable), kept {kept} -> {outFile}");
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
