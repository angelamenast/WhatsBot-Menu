const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://psjabssvkwpwrwaczfyq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzamFic3N2a3dwd3J3YWN6ZnlxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODkwNzM0NywiZXhwIjoyMTA0NDgzMzQ3fQ.kDNRVoJ4kfzG60CoeiuRDsQpWJIbPazk5QvjfRqbFoY'; // Service role key

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
