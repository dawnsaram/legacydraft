import './style.css';
import { App } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app 요소를 찾을 수 없습니다.');

new App(root).start();

