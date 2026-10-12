import { createTextheat } from 'textheat';
const text = createTextheat({ theme: { positive: { background: '#CCFFEE', color: '#005533' } } });
console.log(text.heat('The service was excellent.'));