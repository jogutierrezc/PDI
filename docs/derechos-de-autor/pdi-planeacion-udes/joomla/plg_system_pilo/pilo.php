<?php
/* =============================================================================
   Mr. Pilo en el portal · plugin de sistema para Joomla 3
   -----------------------------------------------------------------------------
   Pega una sola línea al final de cada página pública:

     <script src="https://planeacion.udes.edu.co/pilo.js"
             data-tema="…" data-esquina="…" defer></script>

   Ese cargador crea el marco (iframe) aislado con el botón, el saludo y el
   chat; la página anfitriona no manda ni recibe nada por su cuenta. Si el
   dominio de este sitio no está autorizado en el portal de Planeación, el
   cargador sencillamente no muestra nada: no hay error visible.

   Qué hace este plugin y qué no:
     · Aparece en todas las páginas públicas del sitio (el asistente lee la
       página actual y responde sobre lo que la persona está viendo).
     · Nunca en la administración: el plugin solo corre en el sitio.
     · Las páginas listadas en «No aparecer en estas páginas» se saltan.
     · No duplica: si la página ya tiene un pilo.js (plantilla, módulo propio),
       no se vuelve a inyectar.
   ========================================================================== */

defined('_JEXEC') or die;

class PlgSystemPilo extends JPlugin
{
	/**
	 * Inyecta la línea del cargador al final del <body> de las páginas del sitio.
	 */
	public function onAfterRender()
	{
		$app = JFactory::getApplication();

		// Solo el sitio, nunca la administración. isClient existe desde Joomla 3.7;
		// isAdmin es el nombre antiguo (Joomla 3.0-3.6 y siguientes).
		if (method_exists($app, 'isClient') ? $app->isClient('administrator') : $app->isAdmin())
		{
			return;
		}

		// Solo páginas HTML normales: nada en formatos crudos, json, feeds o
		// peticiones por ajax (tmpl=component incluido, que pinta pedazos).
		$doc = JFactory::getDocument();
		if ($doc->getType() !== 'html')
		{
			return;
		}

		$input = $app->input;
		if (in_array($input->getCmd('format'), array('raw', 'json', 'xml', 'feed', 'ajax'), true)
			|| $input->getCmd('tmpl') === 'component')
		{
			return;
		}

		$src = trim((string) $this->params->get('pilourl', 'https://planeacion.udes.edu.co/pilo.js'));
		if ($src === '' || !filter_var($src, FILTER_VALIDATE_URL))
		{
			return;
		}

		// Las exclusiones: una dirección (o pedazo) por línea, sin distinción de
		// mayúsculas. Se comparan contra la dirección tal como la ve el navegador
		// (ruta y consulta, sin el dominio).
		$here = strtolower(JUri::getInstance()->toString(array('path', 'query')));

		foreach (preg_split('/\r\n|\r|\n/', (string) $this->params->get('excluir', '')) as $needle)
		{
			$needle = strtolower(trim($needle));
			if ($needle !== '' && strpos($here, $needle) !== false)
			{
				return;
			}
		}

		$body = $app->getBody();
		if (!$body || stripos($body, '</body>') === false || stripos($body, 'pilo.js') !== false)
		{
			return;
		}

		// Los atributos que el cargador entiende. data-pilo solo cuando se pide
		// un espacio distinto del de siempre; data-leer solo cuando sí lee.
		$attrs = '';
		$espacio = trim((string) $this->params->get('espacio', ''));
		if ($espacio !== '')
		{
			$attrs .= ' data-pilo="' . htmlspecialchars($espacio, ENT_COMPAT, 'UTF-8') . '"';
		}
		$attrs .= ' data-tema="' . htmlspecialchars((string) $this->params->get('tema', 'blanco'), ENT_COMPAT, 'UTF-8') . '"';
		$attrs .= ' data-esquina="' . htmlspecialchars((string) $this->params->get('esquina', 'izquierda'), ENT_COMPAT, 'UTF-8') . '"';

		$leer = (string) $this->params->get('leer', 'si');
		if ($leer === 'si' || $leer === 'todo')
		{
			$attrs .= ' data-leer="' . $leer . '"';
		}

		$script = '<script src="' . htmlspecialchars($src, ENT_COMPAT, 'UTF-8') . '"' . $attrs . ' defer></script>';

		$app->setBody(preg_replace('#</body>#i', $script . "\n</body>", $body, 1));
	}
}
