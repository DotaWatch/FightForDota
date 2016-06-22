
function BMediaSourceExtensionsSupported()
{
	var bSupported = false;
	try
	{
		bSupported = MediaSource.isTypeSupported( 'video/mp4;codecs="avc1.4d4032,mp4a.40.2"' );
	}
	catch (e)
	{
	}

	return bSupported;
}

// called by steam client when going into minimized broadcast view
function SteamClientMinimize()
{
	$J( document.body ).addClass( 'SteamClientMinimized' );
}

// called by steam client when going into normal broadcast view
function SteamClientMaximize()
{
	$J( document.body ).removeClass( 'SteamClientMinimized' );
}

// called by steam client when moved to popout
function SteamClientPopOut()
{
	$J( '#PopOutBtn' ).hide();
}

// called by steam client when loaded in nav panel
function SteamClientShowPopOut()
{
	$J( '#PopOutBtn' ).show();
}


var CBroadcastWatch = function( steamIDBroadcast, name, eClientType, steamIDViewer, IFrameHelper )
{
	this.m_ulBroadcastSteamID = steamIDBroadcast;
	this.m_ulViewerSteamID = steamIDViewer;
	this.m_strBroadcastName = name;
	this.m_ulBroadcastID = 0;
	this.m_eClientType = eClientType;
	this.m_timeoutUpdate = null;
	this.m_elVideoPlayer = document.getElementById( 'videoplayer' );
	this.m_xhrViewUsers = null;
	this.m_bUnlockingH264 = false;
	this.m_DASHPlayerStats = null;
	this.m_bChatEnabled = null;
	this.m_bVideoEnabled = null;
	this.m_bDisableChatTooltips = false;
	this.m_IFrameHelper = IFrameHelper;
	
	this.m_ulViewerToken = WebStorage.GetLocal( "broadcastViewerToken" );

	if ( this.m_ulViewerToken == null )
	{
		this.m_ulViewerToken = 0;
	}
};

CBroadcastWatch.s_UpdateTimeoutSec = 60;
CBroadcastWatch.k_InBrowser = 1;
CBroadcastWatch.k_InClient = 2;
CBroadcastWatch.k_InOverlay = 3;

CBroadcastWatch.prototype.ToggleStats = function()
{
	if ( this.m_DASHPlayerStats )
		this.m_DASHPlayerStats.Toggle();
};

CBroadcastWatch.prototype.GetChat = function()
{
	return this.m_chat;
};

CBroadcastWatch.prototype.GetBroadcastID = function()
{
	return this.m_ulBroadcastID;
};

CBroadcastWatch.prototype.IsBroadcaster = function()
{
	return (this.m_ulBroadcastSteamID == this.m_ulViewerSteamID);
};

CBroadcastWatch.prototype.ShowVideoError = function( strError )
{
	if ( $J( '#PageContents' ).hasClass( 'ShowPlayer' ) )
	{
		$J( '#VideoLoadingText' ).html( strError );
		$J( '#VideoLoadingText' ).addClass( 'Error' );
		$J( '#LoadingVideoContent' ).addClass( 'HideThrobber' );
	}
	else
	{
		$J( '#PageLoadingText' ).html( strError );
		$J( '#PageLoadingText' ).addClass( 'Error' );
		$J( '#LoadingContent' ).addClass( 'HideThrobber' );
	}
};

CBroadcastWatch.prototype.SetVideoLoadingText = function( strText )
{
	if ( $J( '#PageContents' ).hasClass( 'ShowPlayer' ) )
	{
		$J( '#VideoLoadingText' ).html( strText  );
	}
	else
	{
		$J('#PageLoadingText').html( strText );
	}
};

CBroadcastWatch.prototype.UnlockH264 = function()
{
	if ( this.m_eClientType != CBroadcastWatch.k_InClient && this.m_eClientType != CBroadcastWatch.k_InOverlay )
	{
		this.ShowVideoError( '您必须加入 Steam 客户端的测试版才能观看此直播。<br><br><a href="https://support.steampowered.com/kb_article.php?ref=6730-TOAK-6497">访问直播常见问题</a>了解如何加入最新的测试版客户端。' );
		return;
	}

	window.open( 'steam://unlockh264/' );
	this.SetVideoLoadingText( '正在更新 Steam...' );
	this.WaitUnlockH264( Date.now() );
};

CBroadcastWatch.prototype.WaitUnlockH264 = function( rtStart )
{
	if ( BMediaSourceExtensionsSupported() )
	{
		this.Start( true, true );
		return;
	}

	if ( Date.now() - rtStart > 30000 )
	{
		this.ShowVideoError( '无法应用一个 Steam 更新，它是观看此直播所必需的。<br><br>请确保您的客户端已经连接到 Steam 并重试。' );
		return;
	}

	var _watch = this;
	window.setTimeout( function() { _watch.WaitUnlockH264( rtStart ); }, 5000 );
};

CBroadcastWatch.prototype.Start = function( bEnableVideo, bEnableChat )
{
	var _watch = this;

	this.m_bVideoEnabled = bEnableVideo;
	this.m_bChatEnabled = bEnableChat;

	if ( bEnableVideo && !BMediaSourceExtensionsSupported() )
	{
		if ( this.m_eClientType != CBroadcastWatch.k_InBrowser )
		{
			this.UnlockH264();
			return;
		}

		this.ShowVideoError( '您的网页浏览器不支持观看此直播所需要功能的最低要求。<br><br>您可以<a href="steam://broadcast/watch/%steamid%">在 Steam 客户端内</a>观看此直播，或者<a href="https://support.steampowered.com/kb_article.php?ref=6730-TOAK-6497">访问直播的常见问题</a>查阅所支持的浏览器的列表。'.replace( '%steamid%', this.m_ulBroadcastSteamID ) );
		return;
	}

	if ( bEnableChat )
	{
		this.m_chat = new CBroadcastChat( this.m_ulBroadcastSteamID );
	}

	if ( bEnableVideo )
	{
		this.m_player = new CDASHPlayer( this.m_elVideoPlayer );
		this.m_playerUI = new CDASHPlayerUI( this.m_player, CDASHPlayerUI.eUIModeDesktop );
		this.m_playerUI.Init();

		this.m_DASHPlayerStats = new CDASHPlayerStats( this.m_elVideoPlayer, this.m_player, this.m_ulViewerSteamID );

		$J( this.m_elVideoPlayer ).on( 'bufferingcomplete.BroadcastWatchEvents', function() { _watch.OnPlayerBufferingComplete(); } );
		$J( this.m_elVideoPlayer ).on( 'downloadfailed.BroadcastWatchEvents', function() { _watch.OnPlayerDownloadFailed(); } );
		$J( this.m_elVideoPlayer ).on( 'playbackerror.BroadcastWatchEvents', function() { _watch.OnPlayerPlaybackError(); } );

		$J( this.m_elVideoPlayer ).on( 'gamedataupdate', function( e, pts, Data ) { _watch.OnGameFrameReceived( pts, Data ); } );

		this.GetBroadcastMPD();
	}
};

CBroadcastWatch.prototype.SetGameDataUpdateFrequency = function( flFreq )
{
	if ( !this.m_bVideoEnabled )
		return;

	CDASHPlayer.GAMEDATA_TRIGGER_MS = 1000 / Math.max( 3, Math.min( 10, flFreq ) );
};

CBroadcastWatch.prototype.DisableChatTooltips = function()
{
	this.m_bDisableChatTooltips = true;
};

CBroadcastWatch.prototype.OnPlayerBufferingComplete = function()
{
	$J( '#PageContents' ).removeClass( 'LoadingVideo' );
};

CBroadcastWatch.prototype.OnPlayerDownloadFailed = function()
{
	this.SetVideoLoadingText( '正在载入…' );
	this.GetBroadcastMPD();
};

CBroadcastWatch.prototype.OnPlayerPlaybackError = function()
{
	this.ShowVideoError( '播放此视频时发生意外错误' );
};

CBroadcastWatch.prototype.OnGameFrameReceived = function( pts, Data )
{
	this.PostMessageToIFrameParent( "OnGameDataReceived", { pts: pts, data: Data } );
};

CBroadcastWatch.prototype.AddBroadcasterName = function( str )
{
	var strEscaped = $J( '<span/>' ).text( this.m_strBroadcastName ).html();
	return str.replace( /%s/, strEscaped );
};

function LocalizeCount( strSingular, strPlural, nValue )
{
	if ( nValue == 1 )
		return strSingular;

	return strPlural.replace( /%s/, v_numberformat( nValue ) );
}

CBroadcastWatch.prototype.GetBroadcastMPD = function( rtStartRequest )
{
	if ( !this.m_bVideoEnabled )
		return;

	$J( '#PageContents' ).addClass( 'LoadingVideo' );

	var _watch = this;
	if ( !rtStartRequest )
		rtStartRequest = Date.now();

	$J.ajax( {
		url: 'http://steamcommunity.com/broadcast/getbroadcastmpd/',
		data: {
			steamid: _watch.m_ulBroadcastSteamID,
			broadcastid: _watch.m_ulBroadcastID,
			viewertoken: _watch.m_ulViewerToken
		},
		type: 'GET'
	})
	.done( function( data )
	{
		if ( data.success == 'waiting' )
		{
			_watch.SetVideoLoadingText( _watch.AddBroadcasterName( '等待 %s 的响应' ) );

		 			 	var rtWait = (Date.now() - rtStartRequest);
		 	if ( rtWait > 60 * 1000 )
		 	{
		 		_watch.ShowVideoError( _watch.AddBroadcasterName( '%s 的直播此时不可用' ) );
		 		return;
		 	}

		 	var timeout = ( rtWait > 30 * 1000 ) ? data.retry : 5000;
			setTimeout( function() { _watch.GetBroadcastMPD( rtStartRequest ) }, timeout );
		}
		else if ( data.success == 'waiting_for_start' )
		{
			_watch.SetVideoLoadingText( _watch.AddBroadcasterName( '等待 %s 的直播开始' ) );
			setTimeout( function() { _watch.GetBroadcastMPD() }, data.retry );
		}
		else if ( data.success == 'waiting_for_reconnect' )
		{
			_watch.SetVideoLoadingText( _watch.AddBroadcasterName( '等待 %s 重新连接至 Steam' ) );
			setTimeout( function() { _watch.GetBroadcastMPD() }, data.retry );
        	}
		else if ( data.success == 'ready' )
		{
			_watch.m_ulBroadcastID = data.broadcastid;

			if( _watch.m_ulViewerToken != data.viewertoken )
			{
				_watch.m_ulViewerToken = data.viewertoken;
				WebStorage.SetLocal( "broadcastViewerToken", _watch.m_ulViewerToken );
			}

			_watch.LoadBroadcastMPD( data.url );

			_watch.UpdateBroadcastInfo();

			if ( _watch.m_chat && _watch.m_bChatEnabled )
			{
				_watch.m_chat.RequestChatInfo( data.broadcastid );
			}
			// If we're in an IFrame and are video-only, send a message over the fence to plumb the new broadcastid into the
			// other chat iframe, so it can call RequestChatInfo.
			else if ( _watch.m_IFrameHelper )
			{
				_watch.PostMessageToIFrameParent( 'OnBroadcastIDChanged', { broadcastid: data.broadcastid } );
			}

			// Hide the loading panel
			_watch.HideLoadingPanel();
		}
		else if ( data.success == 'end' )
		{
			_watch.ShowVideoError( _watch.AddBroadcasterName( '%s 的直播已经结束' ) );
		}
		else if ( data.success == 'noservers' )
		{
			_watch.ShowVideoError( _watch.AddBroadcasterName( 'Steam 目前在 %s 的区域直播上遇到了过高负载，目前无法保留一个服务器位置来开始此直播。<br><br>更多的服务器容量将在 Steam 实况直播的测试版之后被添加。请稍后再试。' ) );
		}
		else if ( data.success == 'system_not_supported' )
		{
			_watch.ShowVideoError( _watch.AddBroadcasterName( 'Steam 实况直播目前不支持 %s 的系统' ) );
		}
		else if ( data.success == 'user_restricted' )
		{
			_watch.ShowVideoError( _watch.AddBroadcasterName( '%s 的帐户目前在 Steam 上直播受到限制' ) );
		}
		else if ( data.success == 'client_out_of_date' )
		{
			_watch.ShowVideoError( _watch.AddBroadcasterName( '%s 的客户端必须被更新才能支持 Steam 实况直播' ) );
		}
		else if ( data.success == 'poor_upload_quality' )
		{
			_watch.ShowVideoError( _watch.AddBroadcasterName( '%s 目前无法与 Steam 维持稳定的直播连接。' ) );
		}
		else if ( data.success == 'request_failed' )
		{
			_watch.ShowVideoError( '载入此直播失败' );
		}
		else
		{
			_watch.ShowVideoError( _watch.AddBroadcasterName( '%s 的直播此时不可用' ) );
		}
	})
	.fail( function()
	{
		_watch.ShowVideoError( '查看此直播时发生意外错误' );
	});
};

CBroadcastWatch.prototype.LoadBroadcastMPD = function( url )
{
	if ( !this.m_bVideoEnabled )
		return;

	this.m_player.Close();
	this.m_DASHPlayerStats.Reset();
	this.m_player.PlayMPD( url );
};

CBroadcastWatch.prototype.OnVideoIFrameBroadcastIDChanged = function( ulBroadcastID )
{
	if ( !this.m_bChatEnabled )
		return;

	this.m_chat.RequestChatInfo( ulBroadcastID );
	this.HideLoadingPanel();
};

CBroadcastWatch.prototype.HideLoadingPanel = function()
{
	$J( '#PageContents' ).addClass( 'ShowPlayer' );
};

CBroadcastWatch.prototype.UpdateBroadcastInfo = function()
{
	var _watch = this;
	$J.ajax( {
		url: 'http://steamcommunity.com/broadcast/getbroadcastinfo/',
		data:
		{
			steamid: _watch.m_ulBroadcastSteamID,
			broadcastid: _watch.m_ulBroadcastID
		},
		type: 'GET'
	}).done( function( data )
	{
		if ( data.success == 42 )
			return;

		if ( data.success == 1 )
			_watch.SetBroadcastInfo( data );

		_watch.ScheduleBroadcastInfoUpdate();

	}).fail( function()
	{
		_watch.ScheduleBroadcastInfoUpdate();
	});
};

CBroadcastWatch.prototype.SetBroadcastInfo = function( data )
{
	$J( '#BroadcastViewerCount' ).text( LocalizeCount( '1 名观众', '%s 名观众', data.viewer_count ) );

	var strTitle = data.title ? data.title : '';
	var strGameName = data.app_title ? data.app_title : '';

	var strBroadcastURL = 'http://steamcommunity.com/app/' + data.appid + '/broadcasts';
	if ( data.appid == 0 )
		strBroadcastURL = 'http://steamcommunity.com?subsection=broadcasts';

	var strStoreURL = 'http://store.steampowered.com/app/' + data.appid;
	var target = "_blank";
	if ( this.m_eClientType == CBroadcastWatch.k_InClient )
	{
		strBroadcastURL = 'steam://url/GameHubBroadcast/' + data.appid;
		if ( data.appid == 0 )
			strBroadcastURL = 'steam://url/GameHubBroadcasts/';

		strStoreURL = 'steam://store/' + data.appid;
		target = "_self";
	}

	if ( data.appid == 0 )
	{
		$J( '#ViewStorePage' ).hide();
		$J( '#BroadcastGameLink' ).hide();
	}
	else
	{
		$J( '#ViewStorePage' ).show();
		$J( '#BroadcastGameLink' ).show();
	}

	if ( strTitle.length > 0 && strGameName.length > 0 && data.appid != 0 )
		$J( '#BroadcastTitleSeparator' ).show();
	else
		$J( '#BroadcastTitleSeparator' ).hide();

	$J( '#BroadcastGame' ).text( strGameName );
	$J( '#BroadcastTitle' ).text( strTitle );
	$J( '#MoreBroadcastLink' ).attr( 'href', strBroadcastURL).attr( 'target', target );
	$J( '#ViewStorePage' ).attr( 'href', strStoreURL).attr( 'target', target );
	$J( '#BroadcastGameLink' ).attr( 'href', strStoreURL).attr( 'target', target );

	$J( '#BroadcastInfoButtons' ).show();

	if ( this.IsBroadcaster() )
	{
		// show admin box instead of regular box
		$J( '#BroadcasterAdminBox' ).show();
		$J( '#BroadcastInfo' ).hide();
		$J( '#ViewStorePage' ).hide();
		$J( '#ReportBroadcast' ).hide();
		$J( '#BroadcastAdminTitleInput' ).val( strTitle );

		// allow to change MatchID RTMP streams only
		if( !data.is_rtmp )
		{
			$J( '#BroadcastAdminMatchID' ).hide();
		}

		$J( '#BroadcastAdminViewerCount' ).text( LocalizeCount( '1 名观众', '%s 名观众', data.viewer_count ) );
	}

	this.PostMessageToIFrameParent( "OnBroadcastInfoChanged", { viewer_count: data.viewer_count } );
};

function OpenBroadcastLink()
{
	var elButton = $J( this );
	alert( elButton.attr( 'href' ) );
	window.open( elButton.attr( 'href' ) );
}

CBroadcastWatch.prototype.ScheduleBroadcastInfoUpdate = function()
{
	var _watch = this;
	this.m_timeoutUpdate = setTimeout( function() { _watch.UpdateBroadcastInfo() }, CBroadcastWatch.s_UpdateTimeoutSec * 1000 );
};

CBroadcastWatch.prototype.SubmitChat = function()
{
	if ( this.m_chat )
	{
		this.m_chat.ChatSubmit();
	}
};

CBroadcastWatch.prototype.FocusChatTextArea = function()
{
	$J( chatmessage ).attr( 'placeholder', '' );
};

function CreateUnmuteFunc( chat, viewer, elMute )
{
	return function() { chat.UnmuteUser( viewer.id, viewer.name ); elMute.hide(); };
}

CBroadcastWatch.prototype.ShowViewers = function()
{
	if ( this.m_xhrViewUsers )
	{
		this.m_xhrViewUsers.abort();
		this.m_xhrViewUsers = null;
	}

	$J( '#ModalBackground' ).show();
	$J( '#ChatViewerModalBackdrop' ).show();
	$J( '#ViewerModal' ).show();
	$J( '#LoadingViewerModal' ).show();
	$J( '#LoadedViewerModal' ).hide();
	$J( '#LoadedViewerModal' ).scrollTop( 0 );
	$J( '#ViewerModalUsers' ).empty();
	$J( '#ViewerModalViewers' ).hide();
	$J( '#ViewerModalError' ).hide();
	$J( '#ViewerNotReturned' ).hide();

	if ( this.m_bChatEnabled && ( !this.m_chat || this.m_chat.GetChatID() == 0 ) )
	{
		$J( '#LoadingViewerModal' ).hide();
		$J( '#LoadedViewerModal' ).show();
		$J( '#ViewerModalError' ).text( '载入用户列表失败' );
		$J( '#ViewerModalError' ).show();
	}

	// position modal
	var rectBody = document.body.getBoundingClientRect();
	var rectViewerBtn = $J( '#ChatViewersBtn' )[0].getBoundingClientRect();
	var nTop = rectViewerBtn.bottom - rectBody.top + 6;
	var nRight = rectBody.right - rectViewerBtn.right;
	$J( '#ViewerModal' ).css( {top: nTop, right: nRight} );
	$J( '#ChatViewersBtn' ).addClass( 'ViewersVisible' );

	this.UpdateBroadcastViewerUI();
};

CBroadcastWatch.prototype.UpdateBroadcastViewerUI = function()
{
	if ( !this.m_chat )
		return;

	var _watch = this;

	this.m_xhrViewers = $J.ajax(
	{
		url: 'http://steamcommunity.com/broadcast/getbroadcastviewers/',
		data: {
			chatid: _watch.m_chat.GetChatID(),
			muted: _watch.m_chat.GetMutedUsers(),
		},
		type: 'GET'
	})
	.done( function( data )
	{
		$J( '#LoadingViewerModal' ).hide();
		$J( '#LoadedViewerModal' ).show();
		$J( '#ViewerModalViewers' ).show();
		$J( '#LoadedViewerModal' ).scrollTop( 0 );

		$J( '#ViewerModalViewers' ).text( LocalizeCount( '1 名观众', '%s 名观众', data.viewer_count ) );

		if ( data.viewers.length > 0 )
		{
			for ( var i = 0; i < data.viewers.length; i++ )
			{
				var viewer = data.viewers[i];
				var elUser = $J( '<div class="UserRow"><a href="http://steamcommunity.com/profiles/' + viewer.id + '" target="_blank">' + viewer.name + '</a></div>' );
				if ( viewer.muted || _watch.m_chat.IsUserMutedLocally( viewer.id ) )
				{
					var elMute = $J( '<div class="Muted"></div>' );
					if ( !viewer.muted || _watch.IsBroadcaster() )
					{
						elMute.addClass( 'CanUnmute' );
						elMute.on( 'click', CreateUnmuteFunc( _watch.m_chat, viewer, elMute ) );
					}

					elUser.append( elMute );
				}

				if ( !_watch.m_bDisableChatTooltips )
				{
					elUser.children( 'a' ).attr( 'data-miniprofile', 's' + viewer.id );
				}

				$J( '#ViewerModalUsers' ).append( elUser );
			}
		}

		var nMissing = data.viewer_count - data.viewers.length;
		if ( nMissing > 0 )
		{
			$J( '#ViewerNotReturned' ).text( '… 以及其他 %d 位观众'.replace( /%d/, nMissing ) );
			$J( '#ViewerNotReturned' ).show();
		}
	})
	.fail( function()
	{
		$J( '#LoadingViewerModal' ).hide();
		$J( '#LoadedViewerModal' ).show();
		$J( '#ViewerModalError' ).text( '载入用户列表失败' );
		$J( '#ViewerModalError' ).show();
	});
};

CBroadcastWatch.prototype.CloseViewers = function()
{
	if ( this.m_xhrViewUsers )
	{
		this.m_xhrViewUsers.abort();
		this.m_xhrViewUsers = null;
	}

	$J( '#ChatViewersBtn' ).removeClass( 'ViewersVisible' );
	$J( '#ViewerModal' ).hide();
	$J( '#ChatViewerModalBackdrop' ).hide();
	$J( '#ModalBackground' ).hide();
};

CBroadcastWatch.prototype.MinimizeChat = function()
{
	$J( '#PageContents' ).addClass( 'MinimizedChat' );
};

CBroadcastWatch.prototype.MaximizeChat = function()
{
	$J( '#PageContents' ).removeClass( 'MinimizedChat' );
};

CBroadcastWatch.prototype.ReportBroadcast = function()
{
	if ( this.m_ulBroadcastID == 0 || $J( '#ReportBroadcast' ).hasClass( 'Reported' ) )
		return;

	var dialog = ShowPromptWithTextAreaDialog( '举报此物品', '', null, null, 1000 );
	var explanation = $J('<div/>', { 'class': 'report_dialog_explanation' } );
	explanation.html( '请输入您举报此物品违反《Steam 服务条款》的原因。此操作无法撤销。' );

	var textArea = dialog.m_$Content.find( 'textarea' );
	textArea.addClass( "report_dialog_text_area" );
	textArea.parent().before( explanation );

	var _watch = this;
	dialog.done( function( data )
	{
		data = v_trim( data );
		if ( data.length < 1 )
		{
			alert( '请输入一个有效理由。');
			return;
		}

		$J.post( 'http://steamcommunity.com/broadcast/report',
		{
			steamid: _watch.m_ulBroadcastSteamID,
			broadcastid: _watch.m_ulBroadcastID,
			description: data,
		}
		).done( function( json )
		{
			$J( '#ReportBroadcast' ).text( '举报成功' );
			$J( '#ReportBroadcast' ).addClass( 'Reported' );
			$J( '#ReportBroadcast' ).removeClass( 'BroadcastButton' );
		})
		.fail( function()
		{
			alert( '在提交您的请求至我们的服务器时发生了一个错误。请重试。')
		});
	});
};

CBroadcastWatch.prototype.UpdateBroadcast = function()
{
	if ( this.m_ulBroadcastID == 0 )
		return;

	var _watch = this;

	$J.post( 'http://steamcommunity.com/broadcast/updatebroadcastsettings',
	{
		steamid: _watch.m_ulBroadcastSteamID,
		title: $J( '#BroadcastAdminTitleInput' ).val(),
		matchid : $J( '#BroadcastAdminMatchIDInput' ).val()
	}

	).done( function( json )
	{
		$J( '#BroadcastAdminUpdateResult' ).show();
		$J( '#BroadcastAdminUpdateResult' ).css('color', 'green');
		$J( '#BroadcastAdminUpdateResult' ).text( '直播已更新。' );
		$J( '#BroadcastAdminUpdateResult' ).delay(3000).fadeOut("slow");
	})
	.fail( function()
	{
		$J( '#BroadcastAdminUpdateResult' ).show();
		$J( '#BroadcastAdminUpdateResult' ).css('color', 'red');
		$J( '#BroadcastAdminUpdateResult' ).text( '更新直播失败。' );
		$J( '#BroadcastAdminUpdateResult' ).delay(3000).fadeOut("slow");
	});
};

CBroadcastWatch.prototype.StopBroadcast = function()
{
	if ( this.m_ulBroadcastID == 0 )
		return;

	if ( !confirm( '停止直播？' ) )
		return;

	var _watch = this;

	$J.post( 'http://steamcommunity.com/broadcast/stopbroadcast',
	{
		steamid: _watch.m_ulBroadcastSteamID,
		broadcastid : this.m_ulBroadcastID,
	}

	).done( function( json )
	{
		$J( '#BroadcastAdminUpdateResult' ).show();
		$J( '#BroadcastAdminUpdateResult' ).css('color', 'green');
		$J( '#BroadcastAdminUpdateResult' ).text( '直播已暂停。' );
		$J( '#BroadcastAdminUpdateResult' ).delay(3000).fadeOut("slow");
	})
	.fail( function()
	{
		$J( '#BroadcastAdminUpdateResult' ).show();
		$J( '#BroadcastAdminUpdateResult' ).css('color', 'red');
		$J( '#BroadcastAdminUpdateResult' ).text( '暂停直播失败' );
		$J( '#BroadcastAdminUpdateResult' ).delay(3000).fadeOut("slow");
	});
};

CBroadcastWatch.prototype.PostMessageToIFrameParent = function( strMessage, Data )
{
	if ( !this.m_IFrameHelper )
		return;

	this.m_IFrameHelper.PostMessageToIFrameParent( strMessage, Data );
};

