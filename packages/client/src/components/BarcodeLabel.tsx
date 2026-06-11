import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface Props {
  tag: string;
  name: string;
  className?: string;
}

export function BarcodeLabel({ tag, name, className = '' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && tag) {
      JsBarcode(svgRef.current, tag, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 14,
        margin: 8,
      });
    }
  }, [tag]);

  return (
    <div className={`text-center ${className}`}>
      <svg ref={svgRef} />
      <p className="text-xs font-medium mt-1 truncate max-w-[200px]">{name}</p>
    </div>
  );
}

export function printBarcodeLabel(tag: string, name: string) {
  const win = window.open('', '_blank', 'width=400,height=300');
  if (!win) return;

  win.document.write(`
    <!DOCTYPE html>
    <html><head><title>Asset Label - ${tag}</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
    <style>body{font-family:Segoe UI,sans-serif;text-align:center;padding:20px}
    @media print{body{padding:0}}</style></head>
    <body>
      <svg id="barcode"></svg>
      <p style="font-size:12px;margin-top:8px">${name}</p>
      <p style="font-size:10px;color:#666">Liberty Daharki Powers Ltd</p>
      <script>
        JsBarcode("#barcode", "${tag}", {format:"CODE128",width:2,height:60,displayValue:true,fontSize:14});
        setTimeout(()=>{window.print();},500);
      <\/script>
    </body></html>
  `);
  win.document.close();
}
