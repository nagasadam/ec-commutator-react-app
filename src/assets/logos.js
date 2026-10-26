import l60 from './logo-light-60.png'
import l90 from './logo-light-90.png'
import l120 from './logo-light-120.png'
import l180 from './logo-light-180.png'
import l240 from './logo-light-240.png'
import l360 from './logo-light-360.png'
import l480 from './logo-light-480.png'
import d60 from './logo-dark-60.png'
import d90 from './logo-dark-90.png'
import d120 from './logo-dark-120.png'
import d180 from './logo-dark-180.png'
import d240 from './logo-dark-240.png'
import d360 from './logo-dark-360.png'
import d480 from './logo-dark-480.png'

export const light = { src: l240, srcSet: [[l60, 60], [l90, 90], [l120, 120], [l180, 180], [l240, 240], [l360, 360], [l480, 480]].map(([u, w]) => u + ' ' + w + 'w').join(', ') }
export const dark = { src: d240, srcSet: [[d60, 60], [d90, 90], [d120, 120], [d180, 180], [d240, 240], [d360, 360], [d480, 480]].map(([u, w]) => u + ' ' + w + 'w').join(', ') }
