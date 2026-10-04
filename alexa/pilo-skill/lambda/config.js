/* =============================================================================
   Mr. Pilo en Alexa · la configuración, para cuando no hay variables de entorno.

   Una skill alojada por Alexa (la consola de desarrollador) no deja poner
   variables de entorno a la Lambda: se escriben aquí. Si la Lambda sí las
   tiene, mandan ellas y esto no cuenta.

   La clave anónima es la pública del proyecto (Supabase › Project Settings ›
   API › anon public): la misma que ya usa el portal en el navegador. La clave
   de servicio NUNCA va aquí.
   ========================================================================== */

const CONFIG = {
  SUPABASE_URL: "https://dogbfifebeyopcowuzbs.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvZ2JmaWZlYmV5b3Bjb3d1emJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNjIyODcsImV4cCI6MjEwMzkzODI4N30.2sJM4HiogRcnqkWcbZgRf1OtmcdECtqxgx0D6sc0V9w",  // «pregunta» (el Pilo de Planeación) o «ensenanza» (con PILO_ROL «estudiante» o «profesor»).
  PILO_PORTAL: "pregunta",
  PILO_ROL: "",
  // Cuántos segundos llena Alexa mientras Pilo redacta (ver lambda/index.js).
  PILO_WAIT_SECONDS: "40",
  // El id de la skill (amzn1.ask.skill…): con él, la Lambda solo atiende a esta skill.
  ALEXA_SKILL_ID: "",
};

for (const [name, value] of Object.entries(CONFIG)) {
  if (value && !process.env[name]) process.env[name] = value;
}
