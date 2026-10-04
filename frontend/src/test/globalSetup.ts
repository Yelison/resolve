// Fija la zona horaria antes de arrancar los workers para que las horas formateadas sean deterministas.
export default function setup() {
  process.env.TZ = 'UTC'
}
