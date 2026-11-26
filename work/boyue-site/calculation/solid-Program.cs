using System.Runtime.InteropServices;
using System.Text.Json;
using SolidWorks.Interop.sldworks;
class Program {
 static string Root="C:/Users/Administrator/Documents/Codex/2026-11-10/wo/work/solid-input";
 static double[] Values(object? o)=>o is Array a?a.Cast<object>().Select(Convert.ToDouble).ToArray():[];
 static object Edge(IEdge e){
  var c=(ICurve)e.GetCurve();var p=(ICurveParamData)e.GetCurveParams3();var a=Values(p.StartPoint);var b=Values(p.EndPoint);var circle=c.IsCircle();var line=c.IsLine();var length=c.GetLength3(p.UMinValue,p.UMaxValue)*1000;
  var cp=circle?Values(c.CircleParams):[];int n=line?1:circle?Math.Max(2,(int)Math.Ceiling(length/Math.Sqrt(8*Math.Max(.001,cp[6]*1000)*.02))):Math.Max(4,(int)Math.Ceiling(length/10));n=Math.Min(6000,n);
  var points=new List<double[]>();for(int i=0;i<=n;i++){var q=Values(c.Evaluate2(p.UMinValue+(p.UMaxValue-p.UMinValue)*i/n,0));points.Add(q.Take(3).Select(v=>Math.Round(v*1000,5)).ToArray());}
  return new{type=line?"line":circle?"arc":"curve",a=a.Select(x=>x*1000),b=b.Select(x=>x*1000),length,circle=cp,points};
 }
 static void Extract(ISldWorks sw){
  var root="C:/Users/Administrator/Desktop/固顶选型/准备资料/";var inputs=new[]{("odd","20261109B永州铂悦府6#奇数层墙柱.SLDPRT"),("even","20261109B永州铂悦府6#偶数层墙柱（首层进）.SLDPRT")};
  foreach(var (key,file) in inputs){
   var path=Path.GetFullPath(root+file);var doc=sw.GetOpenDocumentByName(path) as IModelDoc2;if(doc==null){int err=0,warn=0;doc=sw.OpenDoc6(path,1,3,"",ref err,ref warn) as IModelDoc2;if(doc==null)throw new Exception("Read-only model open failed: "+err);}
   using var inputStream=File.Open(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite);var hash=Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(inputStream)).ToLowerInvariant();
   var part=(IPartDoc)doc;var bodies=new List<object>();int bodyId=0;
   foreach(IBody2 body in (object[])part.GetBodies2(-1,false)){
    ++bodyId;var checkpoint=Root+"/"+key+"-"+hash[..10]+"-body"+bodyId+".json";
    if(File.Exists(checkpoint)){bodies.Add(JsonDocument.Parse(File.ReadAllText(checkpoint)).RootElement.Clone());Console.WriteLine(key+" restored "+bodyId);continue;}
    var faces=new List<object>();var positions=new List<double>();int faceId=0;
    foreach(IFace2 face in (object[])body.GetFaces()){
     var surface=(ISurface)face.GetSurface();var plane=surface.IsPlane();var normal=Values(face.Normal);var start=positions.Count/3;var mesh=Values(face.GetTessTriangles(true));positions.AddRange(mesh.Select(x=>Math.Round(x*1000,3)));
     // Native planar metrics first. Boundary tessellation is display-only; exact
     // topology is read separately for support-bearing faces after checkpointing.
     var loops=new List<object>();
     faces.Add(new{id=++faceId,plane,normal,planeParams=plane?Values(surface.PlaneParams):[],area=face.GetArea()*1e6,box=Values(face.GetBox()).Select(v=>v*1000),meshStart=start,meshCount=mesh.Length/3,loops});
    }
    var record=new{id=bodyId,name=body.Name,box=Values(body.GetBodyBox()).Select(v=>v*1000),faces,positions};bodies.Add(record);File.WriteAllText(checkpoint,JsonSerializer.Serialize(record));Console.WriteLine(key+" body "+bodyId+" faces "+faces.Count+" vertices "+positions.Count/3);
   }
   var data=new{key,file,path,sha256=hash,revision=sw.RevisionNumber(),units="mm",box=Values(part.GetPartBox(true)).Select(v=>v*1000),bodies};File.WriteAllText(Root+"/"+key+"-native.json",JsonSerializer.Serialize(data));
   Console.WriteLine(JsonSerializer.Serialize(new{key,file,bodies=bodies.Count,box=Values(part.GetPartBox(true)).Select(v=>v*1000)}));
  }
 }
 static void Step(ISldWorks sw){
  string original=(sw.ActiveDoc as IModelDoc2)?.GetTitle()??"";
  foreach(var key in new[]{"odd","even"}){
   var raw=JsonDocument.Parse(File.ReadAllText(Root+"/"+key+"-native.json")).RootElement;var doc=(IModelDoc2)sw.GetOpenDocumentByName(raw.GetProperty("path").GetString());int err=0,warn=0;
   sw.ActivateDoc3(doc.GetTitle(),false,0,ref err);doc.ClearSelection2(true);
   string before=doc.GetPathName();bool ok=doc.Extension.SaveAs(Root+"/"+key+".step",0,3,null,ref err,ref warn);
   Console.WriteLine(JsonSerializer.Serialize(new{key,ok,err,warn,sourceUnchanged=doc.GetPathName()==before}));
  }
  if(original!=""){int err=0;sw.ActivateDoc3(original,false,0,ref err);}
 }
 [DllImport("oleaut32.dll",PreserveSig=false)] static extern void GetActiveObject(ref Guid clsid,IntPtr reserved,[MarshalAs(UnmanagedType.IUnknown)]out object obj);
 [STAThread] static void Main(string[] args){
  if(args.Contains("--reflect")){foreach(var type in new[]{typeof(IEdge),typeof(ICurve),typeof(ILoop2),typeof(ICurveParamData)})Console.WriteLine(type.Name+" "+string.Join("\n",type.GetMembers().Where(m=>new[]{"Params","Curve","Length","Evaluate","Start","End","UMin","UMax","Sense","Edges","Outer","Normal"}.Any(q=>m.Name.Contains(q))).Select(m=>m.ToString())));return;}
  var typeSW=Type.GetTypeFromProgID("SldWorks.Application",true)!;Guid id=typeSW.GUID;GetActiveObject(ref id,IntPtr.Zero,out var obj);var sw=(ISldWorks)obj;
  if(args.Contains("--extract")){Extract(sw);return;}
  if(args.Contains("--step")){Step(sw);return;}
  var docs=new List<object>();var doc=sw.GetFirstDocument() as IModelDoc2;
  while(doc!=null){docs.Add(new{title=doc.GetTitle(),path=doc.GetPathName(),type=doc.GetType()});doc=doc.GetNext() as IModelDoc2;}
  Console.WriteLine(JsonSerializer.Serialize(new{revision=sw.RevisionNumber(),documents=docs}));
 }
}
