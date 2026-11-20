/* WASI's C library leaves out mkstemp. eSpeak NG only uses it to convert sound icons, which this build never loads. */
int mkstemp(char *name);
