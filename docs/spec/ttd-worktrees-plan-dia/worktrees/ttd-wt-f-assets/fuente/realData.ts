/* Datos INVENTADOS para el boceto (no proceden de la cuenta de Pablo). Hoy simulado: lunes 26 oct 2026, jornada 9:00–18:00. */
export type Prio = 'high' | 'medium' | 'low' | 'none';
export type RTask = {
  id: string; title: string; project: string; color: string; prio: Prio; when: string; overdue?: number; dur: number | null;
  tags: string[]; sub?: [number, number]; check?: [number, number]; attach?: string[]; rec?: string; desc: string; section: string;
};
export const TASKS: RTask[] = [
  { id: 'dni', section: 'Vencidas', title: 'Pedir cita previa para renovar el DNI (caduca el 14 de noviembre)', project: 'Personal', color: '#8b5cf6', prio: 'medium', when: 'Venció el 5 oct', overdue: 21, dur: null, tags: ['trámites'],
    desc: 'La web de cita previa abre huecos nuevos a las 8:00 y a las 14:00. Mirar comisarías de **Retiro** y **Moratalaz**.\n\nLlevar: DNI antiguo, foto reciente en fondo blanco y 12 € en efectivo.\n\n[citapreviadnie.es](https://www.citapreviadnie.es)' },
  { id: 'fotos', section: 'Vencidas', title: 'Ordenar las fotos del viaje a Londres y crear el álbum compartido para la familia', project: 'Personal', color: '#8b5cf6', prio: 'none', when: 'Venció el 14 oct', overdue: 12, dur: 120, tags: ['familia', 'fotos'],
    desc: 'Juntar las del móvil de Ana y las mías (unas 640). Quitar duplicadas y borrosas.\n\n- Elegir unas 80 para el álbum\n- Compartir con abuelos y tíos\n- Pedir impresión de 10 para el salón' },
  { id: 'iva', section: 'Vencidas', title: 'Llamar a la gestoría por la declaración trimestral del IVA (modelo 303)', project: 'Trabajo · Administración', color: '#0ea5e9', prio: 'high', when: 'Venció el 20 oct', overdue: 6, dur: 15, tags: ['impuestos', 'llamada'],
    desc: 'Preguntar por la factura de Acme que entró en octubre y si va en este trimestre. Plazo de presentación: **30 de octubre**.\n\nTeléfono de **@Rosa** (gestoría): 91 555 01 23.' },
  { id: 'contrato', section: 'Vencidas', title: 'Revisar contrato del alquiler de la casa de Cadaqués antes de firmar', project: 'Casa', color: '#f59e0b', prio: 'medium', when: 'Venció el 23 oct', overdue: 3, dur: 45, tags: ['vacaciones', 'contratos'], attach: ['contrato-cadaques-2027.pdf · 412 KB', 'anexo-inventario.pdf · 96 KB'],
    desc: 'El propietario (**@Jordi Puig**) pide respuesta esta semana. Puntos a revisar con calma:\n\n1. **Fianza**: piden 2 mensualidades; en 2026 fue 1. ¿Negociable?\n2. Cláusula 7: penalización por cancelación del 50 % si es con menos de 60 días.\n3. Inventario: falta la cuna de viaje que pedimos para Lucía.\n4. Fechas: del **2 al 16 de agosto de 2027**, entrada a partir de las 16:00.\n\nComentarios de Ana en el hilo: [correo del 21 oct](https://mail.example.com/t/cadaques). Si todo cuadra, firmar con Autofirma y reenviar a Jordi.' },
  { id: 'weekly', section: 'Vencidas', title: 'Revisión semanal y plan de la semana', project: 'Planificación', color: '#10b981', prio: 'medium', when: 'Venció ayer, dom 25', overdue: 1, dur: 60, tags: ['revisión'], rec: 'Cada domingo',
    desc: 'Vaciar la Bandeja, repasar proyectos activos, mirar calendario de las 2 próximas semanas y elegir las 3 prioridades.' },
  { id: 'excursion', section: 'Vencidas', title: 'Firmar la autorización de la excursión de Martín a Cosmocaixa', project: 'Hijos', color: '#ec4899', prio: 'high', when: 'Venció ayer, dom 25', overdue: 1, dur: 10, tags: ['colegio'],
    desc: 'Se firma en la app del cole (Tokapp) y hay que pagar 18 €. Último día: **martes 27**.' },
  { id: 'propuesta', section: 'Previstas para hoy', title: 'Preparar la propuesta de migración a Kubernetes para el comité de arquitectura', project: 'Trabajo · Plataforma', color: '#0ea5e9', prio: 'high', when: 'Hoy, 17:00', dur: 90, tags: ['arquitectura', 'comité'], sub: [2, 5],
    desc: 'Borrador para enviar a **@Marta** hoy antes de las 17:00; el comité es el jueves 29.\n\n- Coste actual vs. EKS (usar el informe de FinOps de septiembre)\n- Plan por fases: staging en noviembre, producción en febrero\n- Riesgos: equipo sin experiencia en Helm, ventana de congelación de Navidad\n\nPlantilla: [Propuestas técnicas · Drive](https://drive.example.com/plantilla)' },
  { id: 'moto', section: 'Previstas para hoy', title: 'Llevar la moto al taller: revisión de los 12.000 km', project: 'Moto', color: '#64748b', prio: 'medium', when: 'Hoy', dur: 60, tags: ['moto'], check: [2, 6],
    desc: 'Taller Motos Arganzuela, abren de 9:00 a 13:30 y de 16:00 a 20:00. Pedir presupuesto antes de cambiar nada que no sea de la revisión.' },
  { id: 'factura', section: 'Previstas para hoy', title: 'Enviar factura de octubre a Acme', project: 'Trabajo · Administración', color: '#0ea5e9', prio: 'medium', when: 'Hoy', dur: 20, tags: ['facturas'],
    desc: 'Número F-2026-041. Adjuntar el parte de horas firmado por Luis.' },
  { id: 'repaso', section: 'Rutinas de hoy', title: 'Repaso diario de pendientes', project: 'Planificación', color: '#10b981', prio: 'none', when: 'Hoy', dur: 10, tags: [], rec: 'Cada día laborable', desc: '' },
  { id: 'grafana', section: 'Bandeja', title: 'Leer el informe de rendimiento del clúster (semana 43)', project: 'Bandeja', color: '#94a3b8', prio: 'low', when: 'Sin fecha', dur: 40, tags: ['lectura'], desc: 'Lo compartió Iván en #plataforma. Mirar sobre todo la latencia p99 de la API.' },
  { id: 'pintar', section: 'Bandeja', title: 'Pedir presupuesto para pintar la habitación de los niños', project: 'Bandeja', color: '#94a3b8', prio: 'low', when: 'Sin fecha', dur: 20, tags: ['casa'], desc: 'Dos presupuestos al menos. Colores que eligieron: verde salvia y blanco roto.' },
];
export const CHECK = [['Cita pedida para las 9:00', true], ['Llevar ficha técnica y seguro', true], ['Revisión 12.000 km', false], ['Pastillas delanteras', false], ['Presión neumáticos', false], ['Recoger antes de las 20:00', false]] as const;
export const SUBTASKS = [['Recopilar costes actuales', true], ['Comparar con EKS', true], ['Plan por fases', false], ['Riesgos y mitigación', false], ['Enviar borrador a Marta', false]] as const;
/* Martes 27 (para el estado 06) */
export const TUESDAY: RTask[] = [
  { id: 'ensayo', section: 'Previstas para el martes', title: 'Ensayar la presentación del comité con Marta', project: 'Trabajo · Plataforma', color: '#0ea5e9', prio: 'high', when: 'Mar 27', dur: 60, tags: ['comité'], desc: 'Sala Hopper o Meet si Marta teletrabaja.' },
  { id: 'seguro', section: 'Previstas para el martes', title: 'Pagar el seguro de la moto (vence el 31)', project: 'Moto', color: '#64748b', prio: 'medium', when: 'Mar 27', dur: 10, tags: ['moto', 'pagos'], desc: 'Mutua Motera, recibo anual 286 €.' },
  { id: 'tutoria', section: 'Previstas para el martes', title: 'Tutoría con la profe de Lucía', project: 'Hijos', color: '#ec4899', prio: 'medium', when: 'Mar 27, 17:00', dur: 45, tags: ['colegio'], desc: 'Llevar las dudas sobre lectura.' },
];
