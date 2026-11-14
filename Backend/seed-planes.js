const { createClient } = require('@supabase/supabase-js');

// Uso: node --env-file=.env seed-planes.js (lee SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno).
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Ejecuta: node --env-file=.env seed-planes.js');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const planes = [
    {
      nombre: 'Básico',
      precio: 15000,
      limite_mensajes: 1000,
      limite_tokens: null
    },
    {
      nombre: 'Pro',
      precio: 35000,
      limite_mensajes: null,
      limite_tokens: null
    }
  ];

  for (const plan of planes) {
    const { data, error } = await supabase
      .from('planes')
      .insert(plan)
      .select()
      .single();

    if (error) {
      console.error('Error insertando plan:', plan.nombre, error);
    } else {
      console.log('Plan creado:', data.nombre, '- ID:', data.id);
    }
  }
}

run();
