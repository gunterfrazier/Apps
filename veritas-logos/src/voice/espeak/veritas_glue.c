/*
 * Veritas Logos: a tiny WebAssembly front for eSpeak NG, used only to turn text into IPA phonemes for the
 * built-in Piper voice. It does what eSpeak NG's own emscripten glue does in synth_ipa_ (emscripten/espeakng_glue.cpp):
 * runs a synthesis with the phoneme trace switched on, in IPA, and returns the trace.
 *
 * Copyright (C) 2026 the Veritas Logos authors. Based on eSpeak NG, Copyright (C) 2005-2023 Jonathan Duddington,
 * Reece H. Dunn and the eSpeak NG contributors.
 *
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public
 * License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any
 * later version. It is distributed WITHOUT ANY WARRANTY; see <https://www.gnu.org/licenses/>.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <espeak-ng/speak_lib.h>

static int ignore_audio(short *wav, int samples, espeak_EVENT *events) {
  (void)wav; (void)samples; (void)events;
  return 0;
}

/* Starts eSpeak NG with its data in data_path and picks the voice. Returns the sample rate, or a negative number. */
__attribute__((export_name("ve_init")))
int ve_init(const char *data_path, const char *voice) {
  int rate = espeak_Initialize(AUDIO_OUTPUT_SYNCHRONOUS, 0, data_path, espeakINITIALIZE_DONT_EXIT);
  if (rate <= 0) return -1;
  espeak_SetSynthCallback(ignore_audio);
  if (espeak_SetVoiceByName(voice) != EE_OK) return -2;
  return rate;
}

static char *trace = NULL;
static size_t trace_len = 0;

/* The IPA phonemes of text, one clause per line, as eSpeak NG's synth_ipa_ gives them. */
__attribute__((export_name("ve_ipa")))
const char *ve_ipa(const char *text) {
  free(trace);
  trace = NULL;
  trace_len = 0;
  FILE *out = open_memstream(&trace, &trace_len);
  if (!out) return "";
  espeak_SetPhonemeTrace(1 << 1, out); /* IPA, no separator: what phonemizer.js and the voice's training gave */
  espeak_Synth(text, 0, 0, POS_CHARACTER, 0, 0, NULL, NULL);
  espeak_SetPhonemeTrace(0, NULL);
  fclose(out);
  return trace ? trace : "";
}

__attribute__((export_name("ve_alloc")))
void *ve_alloc(size_t n) { return malloc(n); }

__attribute__((export_name("ve_free")))
void ve_free(void *p) { free(p); }

/* See wasm_compat.h: no temporary files in this build. */
int mkstemp(char *name) { (void)name; return -1; }
