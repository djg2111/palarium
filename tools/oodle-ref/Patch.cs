// Patch mode: load a .sav + its reference output once, then accept
//   "<savOffset> <byteValue>[,<off> <val>...]" per line -> "<firstDiffOutputIndex> <numDiff> <n>"
// This recovers the literal->output mapping of a real stream without shipping any data anywhere.
using System;using System.IO;using OodleSharp;
static class Patch{
  public static void Run(string savPath,string refPath){
    var sav=File.ReadAllBytes(savPath); var refb=File.ReadAllBytes(refPath);
    int LIMIT=Environment.GetEnvironmentVariable("PATCH_LIMIT")!=null?int.Parse(Environment.GetEnvironmentVariable("PATCH_LIMIT")):int.MaxValue;
    uint un=BitConverter.ToUInt32(sav,0);
    var work=new byte[sav.Length]; var big=new byte[un+262144];
    Console.WriteLine($"READY {sav.Length} {un} {refb.Length}"); Console.Out.Flush();
    string line;
    while((line=Console.ReadLine())!=null){
      Array.Copy(sav,work,sav.Length); Array.Clear(big,0,big.Length);
      if(line.Length>0){
        foreach(var pair in line.Split(',')){
          var sp=pair.Split(' '); work[int.Parse(sp[0])]=byte.Parse(sp[1]);
        }
      }
      int n;
      try{ n=OodleDecompressor.Decompress(new ReadOnlySpan<byte>(work,12,work.Length-12),new Span<byte>(big,0,(int)un)); }
      catch{ Console.WriteLine("-2 0 0"); Console.Out.Flush(); continue; }
      int first=-1,cnt=0;
      int lim=Math.Min(Math.Min(n<0?0:n,refb.Length),LIMIT);
      for(int i=0;i<lim;i++) if(big[i]!=refb[i]){ if(first<0)first=i; cnt++; }
      Console.WriteLine($"{first} {cnt} {n}"); Console.Out.Flush();
    }
  }
}
