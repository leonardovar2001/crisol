import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Se genera en el navegador, sin pedirle la imagen a ningún servicio: un
 * ejercicio puede correrse en una red sin salida a internet y el QR tiene que
 * aparecer igual.
 */
export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void QRCode.toString(value, {
      type: 'svg',
      margin: 1,
      // Alto: se escanea proyectado, de lejos y a veces desenfocado.
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((out) => {
        if (vivo) setSvg(out);
      })
      .catch(() => {
        if (vivo) setSvg(null);
      });
    return () => {
      vivo = false;
    };
  }, [value]);

  if (!svg) return <div className="qr qr-empty" style={{ width: size, height: size }} />;

  return (
    <div
      className="qr"
      style={{ width: size, height: size }}
      /* Fondo blanco siempre: un QR sobre fondo oscuro no lo lee ningún teléfono. */
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-label="Código QR para entrar"
      role="img"
    />
  );
}
