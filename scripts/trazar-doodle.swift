// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: revisado
//
// Traza un doodle escaneado a contornos SVG, en la Mac, con Vision (VNDetectContoursRequest): la imagen no sale del equipo.
// Así se hizo DoodleLibreta (components/Doodle.tsx) desde docs/notebookscribble.jpeg, con epsilon 0.0004 y área mínima
// 400. Imprime la caja del dibujo (BBOX), cuántos contornos quedaron (N) y el path en píxeles (D), para rellenar con
// fill-rule evenodd. Después se mueve a un viewBox de 100 de ancho.
// Uso: swift scripts/trazar-doodle.swift <imagen> <epsilon> <area-minima>
import Foundation
import Vision
import CoreGraphics
import ImageIO

let args = CommandLine.arguments
let url = URL(fileURLWithPath: args[1])
let epsilon = Float(args[2]) ?? 0.0004
let areaMinima = Double(args[3]) ?? 400

guard let fuente = CGImageSourceCreateWithURL(url as CFURL, nil),
      let imagen = CGImageSourceCreateImageAtIndex(fuente, 0, nil) else { fatalError("no se pudo abrir") }
let ancho = Double(imagen.width), alto = Double(imagen.height)

let pedido = VNDetectContoursRequest()
pedido.detectsDarkOnLight = true
pedido.contrastAdjustment = 1.5
pedido.maximumImageDimension = 2048
try VNImageRequestHandler(cgImage: imagen).perform([pedido])
guard let obs = pedido.results?.first else { fatalError("sin contornos") }

var partes: [String] = []
var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
for i in 0..<obs.contourCount {
  let c = try obs.contour(at: i)
  let caja = c.normalizedPath.boundingBox
  // Descarta motas: el área de su caja en píxeles.
  if Double(caja.width) * ancho * Double(caja.height) * alto < areaMinima { continue }
  let simple = try c.polygonApproximation(epsilon: epsilon)
  let pts = simple.normalizedPoints
  if pts.count < 3 { continue }
  var d = ""
  for (k, p) in pts.enumerated() {
    let x = Double(p.x) * ancho, y = (1 - Double(p.y)) * alto
    minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
    d += (k == 0 ? "M" : "L") + String(format: "%.1f %.1f", x, y)
  }
  partes.append(d + "Z")
}
print(String(format: "BBOX %.1f %.1f %.1f %.1f", minX, minY, maxX, maxY))
print("N \(partes.count)")
print("D " + partes.joined())
