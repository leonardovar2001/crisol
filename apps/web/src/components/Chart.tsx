import { useEffect, useRef, useState } from 'react';

export interface ChartData {
  key: string;
  title: string;
  kind: 'stat' | 'bar' | 'pie' | 'line';
  unit: string | null;
  labels: string[];
  series: Record<string, number[]>;
}

/**
 * Interpola los valores hacia los nuevos en vez de saltar.
 *
 * El momento en que un gráfico se mueve por lo que la mesa acaba de decidir es
 * medio el punto del ejercicio: si cambia de golpe, la sala se lo pierde.
 */
function useTween(target: number[], ms = 700): number[] {
  const [valores, setValores] = useState(target);
  const desde = useRef(target);
  const inicio = useRef(0);
  const cuadro = useRef(0);

  useEffect(() => {
    // Respeta a quien pidió menos movimiento en su sistema.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValores(target);
      return;
    }

    desde.current = valores;
    inicio.current = performance.now();

    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio.current) / ms);
      const suave = 1 - (1 - t) ** 3;
      setValores(target.map((v, i) => (desde.current[i] ?? v) + (v - (desde.current[i] ?? v)) * suave));
      if (t < 1) cuadro.current = requestAnimationFrame(paso);
    };

    cuadro.current = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(target), ms]);

  return valores;
}

/** Redondeo para mostrar: los cálculos con porcentajes dejan colas largas. */
const mostrar = (n: number) =>
  Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : (Math.round(n * 10) / 10).toString();

function Leyenda({ nombres }: { nombres: string[] }) {
  if (nombres.length < 2) return null;
  return (
    <ul className="chart-legend">
      {nombres.map((nombre, i) => (
        <li key={nombre}>
          <span className="chart-swatch" style={{ background: `var(--chart-${(i % 6) + 1})` }} />
          {nombre}
        </li>
      ))}
    </ul>
  );
}

export function Chart({ data }: { data: ChartData }) {
  const nombres = Object.keys(data.series);
  const plano = nombres.flatMap((n) => data.series[n] ?? []);
  const suaves = useTween(plano);
  const porSerie = (i: number) => suaves.slice(i * data.labels.length, (i + 1) * data.labels.length);
  const largo = Math.max(data.labels.length, data.series[nombres[0] ?? '']?.length ?? 0);
  const etiqueta = (i: number) => data.labels[i] ?? `${i + 1}`;

  return (
    <figure className={`chart chart-${data.kind}`}>
      <figcaption>{data.title}</figcaption>

      {data.kind === 'stat' && (
        <p className="chart-stat">
          {mostrar(suaves[0] ?? 0)}
          {data.unit && <span className="chart-unit">{data.unit}</span>}
        </p>
      )}

      {data.kind === 'bar' && (
        <div className="chart-bars">
          {Array.from({ length: largo }, (_, i) => {
            const tope = Math.max(...suaves.map(Math.abs), 1);
            return (
              <div key={i} className="chart-bar-row">
                <span className="chart-bar-label">{etiqueta(i)}</span>
                <span className="chart-bar-track">
                  {nombres.map((nombre, s) => (
                    <span
                      key={nombre}
                      className="chart-bar-fill"
                      style={{
                        width: `${Math.max(0, ((porSerie(s)[i] ?? 0) / tope) * 100)}%`,
                        background: `var(--chart-${(s % 6) + 1})`,
                      }}
                    />
                  ))}
                </span>
                <span className="chart-bar-value">{mostrar(porSerie(0)[i] ?? 0)}</span>
              </div>
            );
          })}
        </div>
      )}

      {data.kind === 'pie' && <Torta valores={porSerie(0)} etiquetas={data.labels} />}

      {data.kind === 'line' && (
        <Linea series={nombres.map((n, s) => porSerie(s))} etiquetas={data.labels} />
      )}

      <Leyenda nombres={nombres} />
    </figure>
  );
}

/** Anillo en vez de torta llena: el agujero deja lugar al total y se lee mejor chico. */
function Torta({ valores, etiquetas }: { valores: number[]; etiquetas: string[] }) {
  const total = valores.reduce((s, v) => s + Math.max(0, v), 0) || 1;
  let acumulado = 0;

  return (
    <div className="chart-pie-wrap">
      <svg viewBox="0 0 42 42" role="img" aria-label="Gráfico de torta">
        {valores.map((valor, i) => {
          const porcion = (Math.max(0, valor) / total) * 100;
          const arco = (
            <circle
              key={i}
              cx="21"
              cy="21"
              r="15.9155"
              fill="none"
              stroke={`var(--chart-${(i % 6) + 1})`}
              strokeWidth="7"
              strokeDasharray={`${porcion} ${100 - porcion}`}
              strokeDashoffset={`${25 - acumulado}`}
            />
          );
          acumulado += porcion;
          return arco;
        })}
      </svg>
      <ul className="chart-pie-legend">
        {valores.map((valor, i) => (
          <li key={i}>
            <span className="chart-swatch" style={{ background: `var(--chart-${(i % 6) + 1})` }} />
            {etiquetas[i] ?? `${i + 1}`}
            <strong>{Math.round((Math.max(0, valor) / total) * 100)}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Linea({ series, etiquetas }: { series: number[][]; etiquetas: string[] }) {
  const todos = series.flat();
  const max = Math.max(...todos, 1);
  const min = Math.min(...todos, 0);
  const rango = max - min || 1;
  const ancho = 100;
  const alto = 40;

  const puntos = (valores: number[]) =>
    valores
      .map((v, i) => {
        const x = valores.length === 1 ? ancho / 2 : (i / (valores.length - 1)) * ancho;
        const y = alto - ((v - min) / rango) * alto;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');

  return (
    <div className="chart-line-wrap">
      <svg viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" role="img" aria-label="Gráfico de línea">
        {series.map((valores, s) => (
          <polyline
            key={s}
            points={puntos(valores)}
            fill="none"
            stroke={`var(--chart-${(s % 6) + 1})`}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      {etiquetas.length > 0 && (
        <div className="chart-line-labels">
          {etiquetas.map((e, i) => (
            <span key={i}>{e}</span>
          ))}
        </div>
      )}
    </div>
  );
}
