/** Keep keyboard navigation inside the top visible modal, not the inert HUD. */
export function containModalFocus(event:KeyboardEvent,root:HTMLElement){
  if(event.key!=='Tab')return;
  const dialog=[...root.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1);
  if(!dialog)return;
  const buttons=[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary,[tabindex="0"]')]
    .filter(el=>!el.closest('[inert]')&&el.getClientRects().length>0);
  if(!buttons.length)return;
  const first=buttons[0],last=buttons[buttons.length-1],active=document.activeElement;
  if(event.shiftKey&&(active===first||!dialog.contains(active))){
    event.preventDefault();last.focus();
  }else if(!event.shiftKey&&(active===last||!dialog.contains(active))){
    event.preventDefault();first.focus();
  }
}
