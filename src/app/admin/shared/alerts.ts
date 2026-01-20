import Swal from 'sweetalert2';
import { tt } from './i18n';

export const showError = (message: string) =>
  Swal.fire({ icon: 'error', title: tt('Error', '错误', '錯誤'), text: message });

export const showSuccess = (message: string) =>
  Swal.fire({
    icon: 'success',
    title: tt('Success', '成功', '成功'),
    text: message,
    timer: 2000,
    showConfirmButton: false,
  });