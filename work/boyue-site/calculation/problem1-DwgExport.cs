using System.Text.Json;
using Autodesk.AutoCAD.Runtime;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Colors;
using Autodesk.AutoCAD.ApplicationServices.Core;
public class ExportResult {
 static string Home="C:/Users/Administrator/Documents/Codex/2026-11-10/wo/work/dwg-export";
 static double[] Pt(JsonElement p)=>p.EnumerateArray().Select(x=>x.GetDouble()).ToArray();
 static void Log(string message)=>File.AppendAllText(Home+"/stages.log",message+"\n");
 [CommandMethod("GDRESULTEXPORT",CommandFlags.Session)]
 public void Run(){
  var jobs=JsonDocument.Parse(File.ReadAllText(Home+"/jobs.json")).RootElement;
  var results=new List<object>();
  foreach(var job in jobs.EnumerateArray()){
   Log("start");using var db=new Database(true,true);Log("db");
   db.Insunits=UnitsValue.Millimeters;
   {using var tr=db.TransactionManager.StartTransaction();Log("tr");
   var lt=(LayerTable)tr.GetObject(db.LayerTableId,OpenMode.ForWrite);
   foreach(var l in job.GetProperty("layers").EnumerateArray()){var name=l.GetProperty("name").GetString()!;if(!lt.Has(name)){var rec=new LayerTableRecord{Name=name,Color=Color.FromColorIndex(ColorMethod.ByAci,l.GetProperty("color").GetInt16())};lt.Add(rec);tr.AddNewlyCreatedDBObject(rec,true);}}
   var bt=(BlockTable)tr.GetObject(db.BlockTableId,OpenMode.ForWrite); var model=(BlockTableRecord)tr.GetObject(bt[BlockTableRecord.ModelSpace],OpenMode.ForWrite);
   var styles=(TextStyleTable)tr.GetObject(db.TextStyleTableId,OpenMode.ForWrite);var style=new TextStyleTableRecord{Name="GD_TEXT",FileName="msyh.ttc"};var textStyle=styles.Add(style);tr.AddNewlyCreatedDBObject(style,true);
   void Add(Entity e,string layer){e.LayerId=lt[layer];model.AppendEntity(e);tr.AddNewlyCreatedDBObject(e,true);}
   int polyn=0,linen=0,blocks=0,textn=0;
   foreach(var p in job.GetProperty("polylines").EnumerateArray()){
    var line=new Polyline();int i=0;foreach(var pt in p.GetProperty("points").EnumerateArray()){var q=Pt(pt);line.AddVertexAt(i++,new Point2d(q[0],q[1]),0,0,0);}line.Closed=p.GetProperty("closed").GetBoolean();Add(line,p.GetProperty("layer").GetString()!);polyn++;
   }
   foreach(var p in job.GetProperty("links").EnumerateArray()){var a=Pt(p.GetProperty("a"));var b=Pt(p.GetProperty("b"));Add(new Line(new Point3d(a[0],a[1],a.Length>2?a[2]:0),new Point3d(b[0],b[1],b.Length>2?b[2]:0)),p.GetProperty("layer").GetString()!);linen++;}
   if(job.TryGetProperty("meshes",out var meshes))foreach(var mesh in meshes.EnumerateArray()){
    var arr=Pt(mesh.GetProperty("positions"));var layer=mesh.GetProperty("layer").GetString()!;
    for(int i=0;i+8<arr.Length;i+=9){var a=new Point3d(arr[i],arr[i+1],arr[i+2]);var b=new Point3d(arr[i+3],arr[i+4],arr[i+5]);var c=new Point3d(arr[i+6],arr[i+7],arr[i+8]);Add(new Face(a,b,c,c,true,true,true,false),layer);}
   }
   Log("nodes");foreach(var n in job.GetProperty("nodes").EnumerateArray()){
    string name=n.GetProperty("model").GetString()!;double length=name=="GD"?100:double.Parse(name.Split('X')[1]);double width=name=="GD"?100:double.Parse(name.Split('X')[0][2..]);
    Log("block "+name);if(!bt.Has(name)){var block=new BlockTableRecord{Name=name};bt.Add(block);tr.AddNewlyCreatedDBObject(block,true);var pl=new Polyline();foreach(var q in new[]{new Point2d(-width/2,-length/2),new Point2d(width/2,-length/2),new Point2d(width/2,length/2),new Point2d(-width/2,length/2)})pl.AddVertexAt(pl.NumberOfVertices,q,0,0,0);pl.Closed=true;block.AppendEntity(pl);tr.AddNewlyCreatedDBObject(pl,true);}Log("block ready");
    var at=Pt(n.GetProperty("at"));var br=new BlockReference(new Point3d(at[0],at[1],at.Length>2?at[2]:0),bt[name]){Rotation=n.GetProperty("angle").GetDouble()};Add(br,n.GetProperty("layer").GetString()!);blocks++;
    var txt=new DBText{TextStyleId=textStyle,TextString=n.GetProperty("id").GetString()!,Height=55,Position=new Point3d(at[0]+70,at[1]+70,at.Length>2?at[2]+30:0)};Add(txt,"GD_IDS");textn++;
   }
   foreach(var q in job.GetProperty("notes").EnumerateArray()){var p=Pt(q.GetProperty("at"));var txt=new DBText{TextStyleId=textStyle,TextString=q.GetProperty("text").GetString()!,Height=q.GetProperty("height").GetDouble(),Position=new Point3d(p[0],p[1],0)};Add(txt,"GD_NOTES");textn++;}
   tr.Commit();}Log("save");string file=job.GetProperty("path").GetString()!;db.SaveAs(file,DwgVersion.AC1032);Log("saved");
   // Read the saved DWG through AutoCAD's database API, independent of the input list.
   using var reopened=new Database(false,true);reopened.ReadDwgFile(file,FileOpenMode.OpenForReadAndAllShare,false,"");using var read=reopened.TransactionManager.StartTransaction();var rb=(BlockTable)read.GetObject(reopened.BlockTableId,OpenMode.ForRead);var space=(BlockTableRecord)read.GetObject(rb[BlockTableRecord.ModelSpace],OpenMode.ForRead);int readBlocks=0,readLines=0;var actual=new HashSet<string>();string Token(double x,double y,double z,string m)=>z.ToString("F3",System.Globalization.CultureInfo.InvariantCulture)+"/"+x.ToString("F3",System.Globalization.CultureInfo.InvariantCulture)+"/"+y.ToString("F3",System.Globalization.CultureInfo.InvariantCulture)+"/"+m;foreach(ObjectId id in space){var e=read.GetObject(id,OpenMode.ForRead);if(e is BlockReference br){readBlocks++;var block=(BlockTableRecord)read.GetObject(br.BlockTableRecord,OpenMode.ForRead);actual.Add(Token(br.Position.X,br.Position.Y,br.Position.Z,block.Name));}if(e is Line)readLines++;}int coordinateErrors=0;foreach(var n in job.GetProperty("nodes").EnumerateArray()){var xy=Pt(n.GetProperty("at"));if(!actual.Contains(Token(xy[0],xy[1],xy.Length>2?xy[2]:0,n.GetProperty("model").GetString()!)))coordinateErrors++;}Log("verified");results.Add(new{file,blocks=job.GetProperty("nodes").GetArrayLength(),lines=job.GetProperty("links").GetArrayLength(),reopenedBlocks=readBlocks,reopenedLines=readLines,coordinateErrors,units=reopened.Insunits.ToString()});
  }
  File.WriteAllText(Home+"/export-verification.json",JsonSerializer.Serialize(results,new JsonSerializerOptions{WriteIndented=true}));
  Application.DocumentManager.MdiActiveDocument.Editor.WriteMessage("\nGD DWG exports completed: "+results.Count);
 }
}
