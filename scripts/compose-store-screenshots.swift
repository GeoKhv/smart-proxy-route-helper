import AppKit
import Foundation

struct ScreenshotSpec {
    let source: String
    let output: String
    let title: String
    let maxWidth: CGFloat
    let maxHeight: CGFloat
    let topOffset: CGFloat
}

let canvasSize = NSSize(width: 1280, height: 800)
let namedRoutes = CommandLine.arguments.contains("--named-routes")
let specs = namedRoutes ? [
    ScreenshotSpec(source: "store-assets/screenshots/v0.4.0/source/options-routes.png", output: "store-assets/screenshots/v0.4.0/01-options-routes.png", title: "Work and Life route sites together", maxWidth: 1118, maxHeight: 699, topOffset: 88),
    ScreenshotSpec(source: "store-assets/screenshots/v0.4.0/source/options-work.png", output: "store-assets/screenshots/v0.4.0/02-options-work-socks5.png", title: "Connect Work to your local SOCKS5 proxy", maxWidth: 1118, maxHeight: 699, topOffset: 88),
    ScreenshotSpec(source: "store-assets/screenshots/v0.4.0/source/options-life.png", output: "store-assets/screenshots/v0.4.0/03-options-life-direct.png", title: "Use Life with DIRECT and an external OS VPN", maxWidth: 1118, maxHeight: 699, topOffset: 88),
    ScreenshotSpec(source: "store-assets/screenshots/v0.4.0/source/popup-life-direct.png", output: "store-assets/screenshots/v0.4.0/04-popup-life-direct.png", title: "See the site's route and Chrome Proxy control", maxWidth: 430, maxHeight: 650, topOffset: 104)
] : [
    ScreenshotSpec(
        source: "store-assets/screenshots/01-options-local-proxy.png",
        output: "store-assets/screenshots/final/01-options-local-proxy.png",
        title: "Configure your local proxy per device",
        maxWidth: 1118,
        maxHeight: 699,
        topOffset: 88
    ),
    ScreenshotSpec(
        source: "store-assets/screenshots/02-options-route-rules.png",
        output: "store-assets/screenshots/final/02-options-route-rules.png",
        title: "Sync route rules across Chrome profiles",
        maxWidth: 1118,
        maxHeight: 699,
        topOffset: 88
    ),
    ScreenshotSpec(
        source: "store-assets/screenshots/03-popup-current-site.png",
        output: "store-assets/screenshots/final/03-popup-current-site.png",
        title: "Route the current site from the popup",
        maxWidth: 430,
        maxHeight: 650,
        topOffset: 104
    ),
    ScreenshotSpec(
        source: "store-assets/screenshots/04-popup-related-domains.png",
        output: "store-assets/screenshots/final/04-popup-related-domains.png",
        title: "Review related-domain suggestions",
        maxWidth: 430,
        maxHeight: 650,
        topOffset: 104
    ),
    ScreenshotSpec(
        source: "store-assets/screenshots/05-popup-recording.png",
        output: "store-assets/screenshots/final/05-popup-recording.png",
        title: "Record action-specific resource hosts",
        maxWidth: 430,
        maxHeight: 650,
        topOffset: 104
    ),
    ScreenshotSpec(
        source: "store-assets/screenshots/06-options-classification-overrides.png",
        output: "store-assets/screenshots/final/06-options-classification-overrides.png",
        title: "Manage personal classification overrides",
        maxWidth: 1118,
        maxHeight: 699,
        topOffset: 88
    )
]

let fileManager = FileManager.default
try fileManager.createDirectory(
    atPath: namedRoutes ? "store-assets/screenshots/v0.4.0" : "store-assets/screenshots/final",
    withIntermediateDirectories: true
)

func rectFromTop(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat) -> NSRect {
    NSRect(x: x, y: canvasSize.height - y - height, width: width, height: height)
}

func drawText(_ text: String, in rect: NSRect, fontSize: CGFloat, weight: NSFont.Weight, color: NSColor, alignment: NSTextAlignment = .center) {
    let paragraphStyle = NSMutableParagraphStyle()
    paragraphStyle.alignment = alignment
    paragraphStyle.lineBreakMode = .byTruncatingTail

    let attributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: fontSize, weight: weight),
        .foregroundColor: color,
        .paragraphStyle: paragraphStyle
    ]

    NSString(string: text).draw(in: rect, withAttributes: attributes)
}

func fit(sourceSize: NSSize, maxWidth: CGFloat, maxHeight: CGFloat) -> NSSize {
    let scale = min(maxWidth / sourceSize.width, maxHeight / sourceSize.height, 1.0)
    return NSSize(width: floor(sourceSize.width * scale), height: floor(sourceSize.height * scale))
}

func drawRoundedRect(_ rect: NSRect, radius: CGFloat, fill: NSColor, stroke: NSColor? = nil, lineWidth: CGFloat = 1) {
    let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
    fill.setFill()
    path.fill()
    if let stroke {
        stroke.setStroke()
        path.lineWidth = lineWidth
        path.stroke()
    }
}

for spec in specs {
    guard let sourceImage = NSImage(contentsOfFile: spec.source) else {
        throw NSError(domain: "ComposeScreenshots", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot load \(spec.source)"])
    }

    let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(canvasSize.width),
        pixelsHigh: Int(canvasSize.height),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!

    bitmap.size = canvasSize
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)

    NSColor(red: 0.960, green: 0.968, blue: 0.976, alpha: 1).setFill()
    NSRect(origin: .zero, size: canvasSize).fill()

    drawText(
        spec.title,
        in: rectFromTop(x: 80, y: 34, width: canvasSize.width - 160, height: 42),
        fontSize: 30,
        weight: .semibold,
        color: NSColor(red: 0.075, green: 0.085, blue: 0.105, alpha: 1)
    )

    let fittedSize = fit(sourceSize: sourceImage.size, maxWidth: spec.maxWidth, maxHeight: spec.maxHeight)
    let imageX = floor((canvasSize.width - fittedSize.width) / 2)
    let imageRect = rectFromTop(x: imageX, y: spec.topOffset, width: fittedSize.width, height: fittedSize.height)
    let frameRect = imageRect.insetBy(dx: -1, dy: -1)

    let shadow = NSShadow()
    shadow.shadowBlurRadius = 22
    shadow.shadowOffset = NSSize(width: 0, height: -6)
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.14)

    NSGraphicsContext.saveGraphicsState()
    shadow.set()
    drawRoundedRect(frameRect, radius: 8, fill: .white)
    NSGraphicsContext.restoreGraphicsState()

    drawRoundedRect(
        frameRect,
        radius: 8,
        fill: .white,
        stroke: NSColor(red: 0.780, green: 0.800, blue: 0.830, alpha: 1),
        lineWidth: 1
    )

    sourceImage.draw(in: imageRect, from: .zero, operation: .sourceOver, fraction: 1.0)

    NSGraphicsContext.restoreGraphicsState()

    // AppKit draws into RGBA. Encode the Store set as RGB by copying the already
    // opaque rendered pixels; a 24-bit bitmap cannot be an AppKit drawing context.
    let encodedBitmap: NSBitmapImageRep
    if namedRoutes {
        let rgb = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(canvasSize.width), pixelsHigh: Int(canvasSize.height), bitsPerSample: 8, samplesPerPixel: 3, hasAlpha: false, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 24)!
        for y in 0..<bitmap.pixelsHigh {
            for x in 0..<bitmap.pixelsWide {
                let source = bitmap.bitmapData! + y * bitmap.bytesPerRow + x * 4
                let target = rgb.bitmapData! + y * rgb.bytesPerRow + x * 3
                target[0] = source[0]
                target[1] = source[1]
                target[2] = source[2]
            }
        }
        encodedBitmap = rgb
    } else {
        encodedBitmap = bitmap
    }
    guard let png = encodedBitmap.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "ComposeScreenshots", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot encode \(spec.output)"])
    }

    try png.write(to: URL(fileURLWithPath: spec.output))
    print("Wrote \(spec.output)")
}
