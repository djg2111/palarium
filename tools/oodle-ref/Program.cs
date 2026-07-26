// Local verification aid only — never shipped. Decompresses a Palworld .sav with
// OodleSharp (managed, comes in via CUE4Parse) to give the JS decoder a byte-exact target.
using System;using System.IO;using System.IO.Compression;using OodleSharp;
class P{static int Main(string[] a){
  if(a.Length==1&&a[0]=="--oracle"){Oracle.Run();return 0;}
  if(a.Length==3&&a[0]=="--patch"){Patch.Run(a[1],a[2]);return 0;}
  if(a.Length<2){Console.Error.WriteLine("usage: oodleref <in.sav> <out.gvas>");return 2;}
  var b=File.ReadAllBytes(a[0]);
  uint un=BitConverter.ToUInt32(b,0), co=BitConverter.ToUInt32(b,4);
  string magic=System.Text.Encoding.ASCII.GetString(b,8,3); byte type=b[11];
  Console.WriteLine($"{Path.GetFileName(a[0])}: file={b.Length} uncompressed={un} compressed={co} magic={magic} type=0x{type:x2}");
  byte[] outp;
  if(magic=="PlZ"){
    using var ms=new MemoryStream(b,12,b.Length-12);
    using var zs=new ZLibStream(ms,CompressionMode.Decompress);
    using var o=new MemoryStream(); zs.CopyTo(o); outp=o.ToArray();
    if(type==0x32){ using var ms2=new MemoryStream(outp,12,outp.Length-12);
      using var zs2=new ZLibStream(ms2,CompressionMode.Decompress);
      using var o2=new MemoryStream(); zs2.CopyTo(o2); outp=o2.ToArray(); }
  } else if(magic=="PlM"){
    outp=new byte[un];
    int n=OodleDecompressor.Decompress(new ReadOnlySpan<byte>(b,12,b.Length-12),outp);
    Console.WriteLine($"  oodle returned {n}");
    if(n!=un){Console.Error.WriteLine($"  !! expected {un}");}
  } else {Console.Error.WriteLine("unknown magic "+magic);return 3;}
  File.WriteAllBytes(a[1],outp);
  Console.WriteLine($"  wrote {outp.Length} bytes -> {a[1]}");
  Console.WriteLine("  head: "+BitConverter.ToString(outp,0,Math.Min(48,outp.Length)).Replace("-"," "));
  return 0;
}}
