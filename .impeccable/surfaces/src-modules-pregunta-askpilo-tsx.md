---
version: 1
slug: "src-modules-pregunta-askpilo-tsx"
primary_target: "src/modules/pregunta/AskPilo.tsx"
related_targets: []
---

# Pregúntele a Pilo (/pregunta)

Modo: Operate. Página pública: cualquier persona le pregunta a Mr. Pilo sobre la Planeación Institucional de la UDES y recibe una respuesta con sus fuentes clicables. Primero responde de memoria (preguntas guardadas y búsqueda en las fuentes publicadas); la IA solo redacta cuando la memoria no alcanza.

## Direction contract

THESIS: Una conversación que dice de dónde sale cada frase. Rechaza el chat genérico de burbujas sin procedencia: cada respuesta lleva su camino (memoria o IA) y sus fuentes numeradas que abren la página exacta del portal.

OWN-WORLD: Barra lateral en la escena marina de Pilo (--pilo-stage, tinta blanca, cian --pilo-accent para lo activo) con las cinco memorias como interruptores con código de dos letras; área de conversación sobre papel azulado (page/surface), Manrope en todo, Fraunces solo en el saludo. Citas como fichas numeradas en azul suave; boleto de origen en el cajón de fuente.

STORY: La persona ve qué sabe Pilo (memorias), pregunta en sus palabras, recibe una respuesta corta con cifras y corte, comprueba cada dato abriendo la fuente y sigue preguntando.

FIRST VIEWPORT: Barra lateral de 280px a la izquierda; al centro, columna de 720px con Pilo (96px), el saludo en Fraunces, el campo de pregunta grande con el selector de memorias y, debajo, cuatro preguntas sugeridas en filas. En el móvil la barra es un cajón.

FORM: «Memorias a la izquierda», posición 4 de 7 en la lista ordenada; seed 0210e584.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
