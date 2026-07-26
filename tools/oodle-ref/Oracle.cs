// Oracle mode: stdin lines of "<uncompressedSize> <hexPayload>" -> stdout "<n> <hexOut(first 256)> <sha of full>"
using System;using System.IO;using System.Globalization;using OodleSharp;
static class Oracle{
  public static void Run(){
    string line;
    while((line=Console.ReadLine())!=null){
      var sp=line.Split(' ');
      if(sp.Length<2){Console.WriteLine("ERR bad");Console.Out.Flush();continue;}
      int un=int.Parse(sp[0]);
      var hex=sp[1]; var src=new byte[hex.Length/2];
      for(int i=0;i<src.Length;i++) src[i]=byte.Parse(hex.Substring(i*2,2),NumberStyles.HexNumber);
      var big=new byte[un+262144]; var dst=big;
      int n;
      try{ n=OodleDecompressor.Decompress(src,new Span<byte>(big,0,un)); }catch(Exception e){ Console.WriteLine("ERR "+e.GetType().Name); Console.Out.Flush(); continue; }
      int show=Math.Min(n<0?0:n,192);
      var sb=new System.Text.StringBuilder();
      for(int i=0;i<show;i++) sb.Append(dst[i].ToString("x2"));
      string h;
      using(var sha=System.Security.Cryptography.SHA1.Create()) h=Convert.ToHexString(sha.ComputeHash(dst,0,Math.Max(n,0))).Substring(0,12);
      Console.WriteLine($"{n} {sb} {h}");
      Console.Out.Flush();
    }
  }
}
