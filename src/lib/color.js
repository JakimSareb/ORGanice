// Interpolates between two colors.
// colorA and colorB should be objects with keys {r, g, b, a}.
// interpolationFactor should be a number between 0 and 1 representing how far from colorA to
// colorB it should interpolate.
// An object with keys {r, g, b, a} will be returned.
export const interpolateColors = (colorA, colorB, interpolationFactor) => {
  return {
    r: parseInt((colorB.r - colorA.r) * interpolationFactor + colorA.r, 10),
    g: parseInt((colorB.g - colorA.g) * interpolationFactor + colorA.g, 10),
    b: parseInt((colorB.b - colorA.b) * interpolationFactor + colorA.b, 10),
    a: (colorB.a - colorA.a) * interpolationFactor + colorA.a,
  };
};

export const rgbaObject = (r, g, b, a) => {
  return { r, g, b, a };
};

export const rgbaString = (rgba) => {
  return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
};

// assumes var is either a longform-hex or rgb(a) color value
export const readRgbaVariable = (varName) => {
  const varValue = getComputedStyle(document.documentElement).getPropertyValue(varName);
  if (varValue.charAt(0) === '#') {
    const hexValue = varValue.substring(1, 7);
    return rgbaObject(
      parseInt(hexValue.substring(0, 2), 16),
      parseInt(hexValue.substring(2, 4), 16),
      parseInt(hexValue.substring(4, 6), 16),
      1
    );
  } else {
    const rgbaValues = [...varValue.matchAll(/[0-9.]+/g)].map((a) => +a[0]);
    if (rgbaValues.length === 3) {
      return rgbaObject(...rgbaValues, 0);
    } else if (rgbaValues.length === 4) {
      return rgbaObject(...rgbaValues);
    } else {
      return rgbaObject(0, 0, 0, 0);
    }
  }
};

export const themes = {
  Solarized: {
    /* 
      https://ethanschoonover.com/solarized/ 
    */
    Light: {
      '--base3': '#fdf6e3',
      '--base2': '#eee8d5',
      '--base1': '#93a1a1',
      '--base0': '#839496',
      // highlights
      '--base00': '#657b83',
      '--base01': '#586e75',
      '--base02': '#073642',
      '--base03': '#002b36',
      // shadows
      '--base0-soft': 'rgba(131, 148, 150, 0.75)',
      // highlighted backgrounds
      '--base1-soft': 'rgba(147, 161, 161, 0.4)',
      // header colors
      '--blue': '#268bd2',
      '--green': '#859900',
      '--cyan': '#2aa198',
      '--yellow': '#b58900',
      // additional colors
      '--orange': '#cb4b16',
      '--red': '#dc322f',
      '--magenta': '#d33682',
      '--violet': '#6c71c4',
      // table highlight
      '--green-soft': 'rgba(133, 153, 0, 0.28)',
    },
    Dark: {
      // backgrounds
      '--base3': '#002b36',
      '--base2': '#073642',
      '--base1': '#586e75',
      '--base0': '#657b83',
      // highlights
      '--base03': '#fdf6e3',
      '--base02': '#eee8d5',
      '--base01': '#93a1a1',
      '--base00': '#839496',
      // shadows
      '--base0-soft': 'rgba(0, 21, 27, 0.75)',
      // highlighted backgrounds
      '--base1-soft': 'rgba(0, 21, 27, 0.4)',
      // header colors
      '--blue': '#268bd2',
      '--green': '#859900',
      '--cyan': '#2aa198',
      '--yellow': '#b58900',
      // additional colors
      '--orange': '#cb4b16',
      '--red': '#dc322f',
      '--magenta': '#6c71c4',
      '--violet': '#d33682',
      // table highlight
      '--green-soft:': 'rgba(133, 153, 0, 0.28)',
    },
  },
  Gruvbox: {
    Light: {
      /*
        see https://github.com/morhetz/gruvbox for palette
        this theme uses the 'faded' version of the color palette
      */
      // background and highlights
      '--base3': '#fbf1c7', // bg0
      '--base2': '#d5c4a1', // bg2
      '--base1': '#bdae93', // bg3
      '--base0': '#a89984', // bg4
      '--base00': '#7c6f64', // fg4
      '--base01': '#665c54', // fg3
      '--base02': '#504945', // fg2
      '--base03': '#282828', // fg0
      // transparent versions
      '--base0-soft': 'rgba(168, 153, 132, 0.75)',
      '--base1-soft': 'rgba(189, 174, 147, 0.4)',
      // header colors
      '--blue': '#076678',
      '--green': '#79740e',
      '--cyan': '#427b58',
      '--yellow': '#b57614',
      // additional colors
      '--orange': '#af3a03',
      '--red': '#9d0006',
      '--magenta': '#8f3f71', // faded purple
      '--violet': '#b16286', // neutral purple
      // table highlight
      '--green-soft': 'rgba(133, 153, 0, 0.28)',
    },
    Dark: {
      /*
        see https://github.com/morhetz/gruvbox for palette
        this theme uses the 'neutral' version of the color palette
      */
      // background and highlights
      '--base3': '#282828', // bg0
      '--base2': '#504945', // bg2
      '--base1': '#665c54', // bg3
      '--base0': '#7c6f64', // bg4
      '--base00': '#a89984', // fg4
      '--base01': '#bdae93', // fg3
      '--base02': '#d5c4a1', // fg2
      '--base03': '#fbf1c7', // fg0
      // transparent versions
      '--base0-soft': 'rgba(20, 20, 20, 0.75)',
      '--base1-soft': 'rgba(20, 20, 20, 0.4)',
      // header colors
      '--blue': '#458588',
      '--green': '#98971a',
      '--cyan': '#689d6a',
      '--yellow': '#d79921',
      // additional colors
      '--orange': '#d65d0e',
      '--red': '#cc241d',
      '--magenta': '#b16286', // neutral purple
      '--violet': '#d3869b', // bright purple
      // table highlight
      '--green-soft': 'rgba(133, 153, 0, 0.28)',
    },
  },
  One: {
    Light: {
      /*
        adaptation of atom one light theme
        https://github.com/atom/atom/tree/master/packages/one-light-ui
      */
      // background and highlights
      '--base03': '#383A42',
      '--base02': '#585A5F',
      '--base01': '#79797C',
      '--base00': '#999999',
      '--base0': '#A0A1A7',
      '--base1': '#C0C0C4',
      '--base2': '#DFE0E2',
      '--base3': '#FFFFFF',
      // transparent versions
      '--base0-soft': 'rgba(160, 161, 167, 0.75)',
      '--base1-soft': 'rgba(192, 192, 196, 0.4)',
      // header colors
      '--blue': '#1492ff',
      '--green': '#2db448',
      '--cyan': '#D831B0', // pink
      '--yellow': '#d5880b',
      // additional colors
      '--orange': '#f42a2a', //red
      '--red': '#f42a2a',
      '--magenta': 'hsl(208, 100%, 56%)', // blue
      '--violet': '#D831B0', // pink
      // table highlight
      '--green-soft': 'rgba(133, 153, 0, 0.28)',
    },
    Dark: {
      /*
        adaptation of atom one dark theme
        https://github.com/atom/atom/tree/master/packages/one-dark-ui
      */
      // background and highlights
      '--base03': '#abb2bf',
      '--base02': '#9198A5',
      '--base01': '#767D8A',
      '--base00': '#5c6370',
      '--base0': '#4c5263',
      '--base1': '#404553',
      '--base2': '#343944',
      '--base3': '#282c34',
      // transparent versions
      '--base0-soft': 'rgba(20, 22, 26, 0.75)',
      '--base1-soft': 'rgba(20, 22, 26, 0.4)',
      // header colors
      '--blue': 'rgb(100, 148, 237)',
      '--green': 'rgb(115, 201, 144)',
      '--cyan': 'rgb(204, 133, 51)', //orange
      '--yellow': 'rgb(226, 192, 141)',
      // additional colors
      '--orange': 'rgb(255, 99, 71)', //red
      '--red': '#D831B0', //pink
      '--magenta': 'rgb(0, 136, 255)', //blue
      '--violet': '#d33682',
      // table highlight
      '--green-soft': 'rgba(133, 153, 0, 0.28)',
    },
  },
  Smyck: {
    /*
      see http://color.smyck.org/ for palette
    */
    Light: {
      // background and highlights
      '--base3': '#F7F7F7',
      '--base2': '#DFDFDF',
      '--base1': '#C8C8C8',
      '--base0': '#B0B0B0',
      '--base00': '#5D5D5D',
      '--base01': '#3E3E3E',
      '--base02': '#1F1F1F',
      '--base03': '#000000',
      // transparent versions
      '--base0-soft': 'rgba(176, 176, 176, 0.75)',
      '--base1-soft': 'rgba(200, 200, 200, 0.4)',
      // header colors
      '--blue': '#72B3CC',
      '--green': '#8EB33B',
      '--cyan': '#218693',
      '--yellow': '#D0B03C',
      // additional colors
      '--orange': '#C75646',
      '--red': '#E09690',
      '--magenta': '#77DFD8',
      '--violet': '#FBB1F9',
      // table highlight
      '--green-soft': 'rgba(133, 153, 0, 0.28)',
    },
    Dark: {
      // background and highlights
      '--base3': '#000000',
      '--base2': '#1F1F1F',
      '--base1': '#3E3E3E',
      '--base0': '#5D5D5D',
      '--base00': '#B0B0B0',
      '--base01': '#C8C8C8',
      '--base02': '#DFDFDF',
      '--base03': '#F7F7F7',
      // transparent versions
      '--base0-soft': 'rgba(31, 31, 31, 0.75)',
      '--base1-soft': 'rgba(31, 31, 31, 0.4)',
      // header colors
      '--blue': '#72B3CC',
      '--green': '#8EB33B',
      '--cyan': '#218693',
      '--yellow': '#D0B03C',
      // additional colors
      '--orange': '#C75646',
      '--red': '#E09690',
      '--magenta': '#77DFD8',
      '--violet': '#FBB1F9',
      // table highlight
      '--green-soft': 'rgba(133, 153, 0, 0.28)',
    },
  },
  Code: {
    Light: {
      /*
        a rough approximation of Light+ (default light theme of VS Code)
        https://github.com/microsoft/vscode/blob/master/extensions/theme-defaults/themes/dark_plus.json
      */
      // backgrounds
      '--base3': '#FFFFFF',
      '--base2': '#DBDBDB',
      '--base1': '#B6B6B6',
      '--base0': '#929292',
      // highlights
      '--base00': '#6D6D6D',
      '--base01': '#494949',
      '--base02': '#242424',
      '--base03': '#000000',
      // shadows
      '--base0-soft': 'rgba(146, 146, 146, 0.75)',
      // highlighted backgrounds
      '--base1-soft': 'rgba(172, 172, 172, 0.4)',
      // header colors
      '--blue': '#0000ff',
      '--green': '#098658',
      '--cyan': '#267f99',
      '--yellow': '#795e26',
      // additional colors
      '--orange': '#ee0000',
      '--red': '#a31515',
      '--magenta': '#0070c1',
      '--violet': '#811f3f',
      // table highlight
      '--green-soft': 'rgba(133, 153, 0, 0.28)',
    },
    Dark: {
      /*
        a rough approximation of Dark+ (default dark theme of VS Code)
        https://github.com/microsoft/vscode/blob/master/extensions/theme-defaults/themes/dark_plus.json
      */
      // backgrounds
      '--base3': '#1E1E1E',
      '--base2': '#2C2C32',
      '--base1': '#303036',
      '--base0': '#34343a',
      // highlights
      '--base00': '#C8C8C8',
      '--base01': '#cccccc',
      '--base02': '#D0D0D0',
      '--base03': '#D4D4D4',
      // shadows
      '--base0-soft': 'rgba(15, 15, 15, 0.75)',
      // highlighted backgrounds
      '--base1-soft': 'rgba(15, 15, 15, 0.4)',
      // header colors
      '--blue': 'rgb(79,193,255)',
      '--green': 'rgb(106, 153, 85)',
      '--cyan': '#ce9178', // orange (cyan is #4EC9B0)
      '--yellow': '#d7ba7d',
      // additional colors
      '--orange': '#d16969', // red
      '--red': '#d16969',
      '--magenta': '#569cd6', // light blue
      '--violet': '#C586C0',
      // table highlight
      '--green-soft': 'rgba(133, 153, 0, 0.28)',
    },
  },
  // ORG Mode para Eli: tema «Unicornio», con los colores del logo y de la pantalla de inicio
  // (rosa #f59fc4, lavanda #b9a0f0, ciruela #5a4870 / #6d52b8, oro #f2b24a, menta #a9e6d0)
  Unicornio: {
    Light: {
      // fondos
      '--base3': '#fcf8fd',
      '--base2': '#f2e9f8',
      '--base1': '#c9b8dc',
      '--base0': '#9d8bb3',
      // textos
      '--base00': '#6b5d80',
      '--base01': '#5a4870',
      '--base02': '#4a3a5e',
      '--base03': '#3f3252',
      // sombras
      '--base0-soft': 'rgba(109, 82, 184, 0.3)',
      // fondos resaltados (encabezado seleccionado…)
      '--base1-soft': 'rgba(245, 159, 196, 0.22)',
      // encabezados
      '--blue': '#6d52b8',
      '--green': '#2f8c6c',
      '--cyan': '#b84a8a',
      '--yellow': '#b77a16',
      // otros
      '--orange': '#d2447f',
      '--red': '#c8374f',
      '--magenta': '#7c5cd6',
      '--violet': '#b06fc4',
      '--green-soft': 'rgba(169, 230, 208, 0.5)',
    },
    Dark: {
      '--base3': '#1e1929',
      '--base2': '#2a2239',
      '--base1': '#3b3152',
      '--base0': '#4b4066',
      '--base00': '#cdc2e2',
      '--base01': '#dcd2ee',
      '--base02': '#eae3f6',
      '--base03': '#f6f1fd',
      '--base0-soft': 'rgba(8, 4, 16, 0.75)',
      '--base1-soft': 'rgba(185, 160, 240, 0.16)',
      '--blue': '#9a80ec',
      '--green': '#7fd4b4',
      '--cyan': '#f59fc4',
      '--yellow': '#f2c46a',
      '--orange': '#f47fb1',
      '--red': '#ff7a90',
      '--magenta': '#8a6be6',
      '--violet': '#e3a6f0',
      '--green-soft': 'rgba(127, 212, 180, 0.22)',
    },
  },
  // ORG Mode para Eli: tema «Cuki», inspirado en una playa: mar aguamarina, espuma blanca y
  // arena rosada
  Cuki: {
    Light: {
      '--base3': '#f7fbfb',
      '--base2': '#e2efef',
      '--base1': '#b5cece',
      '--base0': '#8ca7a8',
      '--base00': '#5c7273',
      '--base01': '#485e5f',
      '--base02': '#344748',
      '--base03': '#253536',
      '--base0-soft': 'rgba(70, 120, 122, 0.3)',
      '--base1-soft': 'rgba(240, 190, 198, 0.3)',
      '--blue': '#2f878d',
      '--green': '#4f9478',
      '--cyan': '#c0677a',
      '--yellow': '#a07f4c',
      '--orange': '#d8677a',
      '--red': '#c24d60',
      '--magenta': '#d77889',
      '--violet': '#7e78ad',
      '--green-soft': 'rgba(150, 212, 206, 0.4)',
    },
    Dark: {
      '--base3': '#15232a',
      '--base2': '#1e3139',
      '--base1': '#2c454d',
      '--base0': '#3a565e',
      '--base00': '#c2d5d6',
      '--base01': '#d2e2e3',
      '--base02': '#e2eded',
      '--base03': '#f2f8f8',
      '--base0-soft': 'rgba(3, 10, 13, 0.75)',
      '--base1-soft': 'rgba(242, 184, 192, 0.14)',
      '--blue': '#4fb0b6',
      '--green': '#8fd0b0',
      '--cyan': '#f2b3bd',
      '--yellow': '#e6cf9c',
      '--orange': '#f5949f',
      '--red': '#ff8795',
      '--magenta': '#d9788a',
      '--violet': '#b7ace0',
      '--green-soft': 'rgba(143, 208, 176, 0.2)',
    },
  },
  // (4.34) tema «Logseq»: blanco y gris cálido con enlaces azules (oscuro: el azul petróleo de
  // Logseq). La tipografía, los espaciados y las viñetas están en eli_theme_logseq.css.
  Logseq: {
    Light: {
      '--base3': '#ffffff',
      '--base2': '#f4f4f2',
      '--base1': '#d9d8d4',
      '--base0': '#a1a09b',
      '--base00': '#433f38',
      '--base01': '#433f38',
      '--base02': '#2f2c27',
      '--base03': '#1f1d1a',
      '--base0-soft': 'rgba(67, 63, 56, 0.22)',
      '--base1-soft': 'rgba(4, 85, 145, 0.08)',
      '--blue': '#045591',
      '--green': '#3d8b5e',
      '--cyan': '#2f7f94',
      '--yellow': '#b8860b',
      '--orange': '#d9730d',
      '--red': '#d44c47',
      '--magenta': '#6f5bb3',
      '--violet': '#8d6bb5',
      '--green-soft': 'rgba(61, 139, 94, 0.2)',
    },
    Dark: {
      '--base3': '#002b36',
      '--base2': '#073642',
      '--base1': '#16505f',
      '--base0': '#5b7c84',
      '--base00': '#a4b5b6',
      '--base01': '#b4c3c4',
      '--base02': '#cad6d7',
      '--base03': '#e4ecec',
      '--base0-soft': 'rgba(0, 12, 16, 0.7)',
      '--base1-soft': 'rgba(111, 163, 208, 0.14)',
      '--blue': '#6fa3d0',
      '--green': '#6cc391',
      '--cyan': '#5bb8cc',
      '--yellow': '#e0b94f',
      '--orange': '#f0a060',
      '--red': '#f0726d',
      '--magenta': '#a58ce6',
      '--violet': '#c39be0',
      '--green-soft': 'rgba(108, 195, 145, 0.2)',
    },
  },
  // (3.05) tema «Nirvana», inspirado en NirvanaHQ: grises claros, filas blancas y acento azul
  // (oscuro: grafito). La vista GTD tiene además sus propios retoques (Gtd/stylesheet.css, con
  // html[data-eli-theme='Nirvana']).
  Nirvana: {
    Light: {
      '--base3': '#ffffff',
      '--base2': '#ececec',
      '--base1': '#d0d0d0',
      '--base0': '#999999',
      '--base00': '#4a4a4a',
      '--base01': '#333333',
      '--base02': '#262626',
      '--base03': '#1c1c1c',
      '--base0-soft': 'rgba(0, 0, 0, 0.16)',
      '--base1-soft': 'rgba(91, 143, 217, 0.13)',
      '--blue': '#5b8fd9',
      '--green': '#4a9d6e',
      '--cyan': '#3f8fae',
      '--yellow': '#c99a1e',
      '--orange': '#e0843a',
      '--red': '#d9534f',
      '--magenta': '#8b6fd1',
      '--violet': '#a866bd',
      '--green-soft': 'rgba(74, 157, 110, 0.2)',
    },
    Dark: {
      '--base3': '#202227',
      '--base2': '#2c2f36',
      '--base1': '#3c4048',
      '--base0': '#61656e',
      '--base00': '#c8c8c8',
      '--base01': '#e2e2e2',
      '--base02': '#ececec',
      '--base03': '#f5f5f5',
      '--base0-soft': 'rgba(0, 0, 0, 0.6)',
      '--base1-soft': 'rgba(91, 143, 217, 0.18)',
      '--blue': '#6b9de3',
      '--green': '#6cc391',
      '--cyan': '#69b4cf',
      '--yellow': '#e6c45a',
      '--orange': '#f0a060',
      '--red': '#f0726d',
      '--magenta': '#a58ce6',
      '--violet': '#cf8fe0',
      '--green-soft': 'rgba(108, 195, 145, 0.2)',
    },
  },
};

export const loadTheme = (theme = 'Solarized', colorScheme = 'Light') => {
  if (colorScheme === 'OS') {
    const osPreference = window.matchMedia('(prefers-color-scheme: dark)');
    if ('matches' in osPreference) {
      colorScheme = osPreference.matches ? 'Dark' : 'Light';
    } else {
      colorScheme = 'Light';
    }
  }
  // Tema desconocido (p. ej. guardado por otra versión): el de siempre
  const themeColors = (themes[theme] || themes.Solarized)[colorScheme] || themes.Solarized.Light;
  const style = document.documentElement.style;
  Object.entries(themeColors).forEach(([k, v]) => style.setProperty(k, v));
  // (3.05) para los retoques propios de cada tema en CSS (p. ej. Nirvana en la vista GTD)
  const themeName = themes[theme] ? theme : 'Solarized';
  const scheme = (themes[themeName] || {})[colorScheme] ? colorScheme : 'Light';
  document.documentElement.setAttribute('data-eli-theme', themeName);
  document.documentElement.setAttribute('data-eli-scheme', scheme);

  // Cache resolved CSS variables so the inline script in index.html can
  // apply them before CSS loads on the next cold start (eliminates flash).
  try {
    localStorage.setItem('themeVariables', JSON.stringify(themeColors));
    localStorage.setItem('themeAttrs', JSON.stringify([themeName, scheme]));
  } catch (_e) {
    // localStorage may be unavailable; ignore.
  }

  // set theme color on android
  document
    .querySelector('meta[name="theme-color"]')
    .setAttribute('content', themeColors['--base3']);
};
