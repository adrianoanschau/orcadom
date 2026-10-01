---
'@orcadom/api': patch
'@orcadom/web': patch
---

O limite de login e o IP da sessão passam a usar o endereço real do cliente atrás do proxy, em vez do IP do container web.
