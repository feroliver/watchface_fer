# watchface_fer

Watchface para Pebble Time 2 (plataforma `emery`) escrito en C.

```sh
pebble build
pebble install --emulator emery
```


## Créditos

- Diseño inspirado en [Typical Outdoor](https://apps.repebble.com/typical-outdoor_246967574a054baa90f691bf)
  de rukari / @hidea. El código de este repo es propio.
- Fuente [Russo One](https://fonts.google.com/specimen/Russo+One) de Jovanny Lemonad,
  bajo SIL Open Font License 1.1 (`resources/fonts/OFL.txt`).
- Integración con LibreLinkUp basada en lo documentado por
  [nightscout-librelink-up](https://github.com/timoschlueter/nightscout-librelink-up) y
  [pylibrelinkup](https://github.com/robberwick/pylibrelinkup). API no oficial de Abbott:
  el valor de glucosa en el reloj es orientativo.
