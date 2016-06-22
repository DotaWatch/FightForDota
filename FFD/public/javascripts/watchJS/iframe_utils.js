
var CIFrameHelper = function( strWhitelistedDomain )
{
	this.m_strWhitelistedDomain = strWhitelistedDomain;
}

CIFrameHelper.prototype.PostMessageToIFrameParent = function( strMessage, Data )
{
	if ( !window.parent )
		return;

	var Msg = $J.extend( Data, { msg: strMessage } );
	window.parent.postMessage( Msg, this.m_strWhitelistedDomain );
}


