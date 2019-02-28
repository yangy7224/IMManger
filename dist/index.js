/**
 * Created by yiyang1990 on 2019/2/27.
 */
import request from '~/utils/request'

const defaultImg = require('~/static/images/icon-default-head.png');

const baseLoadingConfig = {
  isNeedLoadingShow: true
}

const api = {
  // 获取指定关联对象中的所有聊天记录，用于前台。
  GHIMGetHistoryMessagesByRelationTalker: (params) => {
    return request.get('/IM/GetHistoryMessagesByRelationTalker', {
      params: params
    })
  },
  // 获取关联对象的聊天对象列表，附带最新消息
  GHIMGetTalkerMessages: (params) => {
    return request.get('/IM/GetTalkerByRelation', {
      params: params
    })
  },
  // 设置消息已读
  GHIMSetMessagesReaded: (params) => {
    return request.get('/IM/SetMessagesReaded', {
      params: params
    })
  },
  // 获取最新报价 /Inquiry/GetQuoteByLast
  GHInquiryGetQuoteByLast: (params) => {
    return request.get('/Inquiry/GetQuoteByLast', {
      params: params
    })
  },

  // 创建报价单（修改也视为新建，生成一个新的报价单ID）
  GHInquiryCreateQuote: (params) => {
    return request.post('/Inquiry/CreateQuote', params, baseLoadingConfig)
  }
};

export default class IMManager{
  constructor(options){
    this.api = api;  //调用的api
    this.options = options;  //配置项

    this.talkerList = [];  //聊天对象列表
    this.curTalker = {
      userName:'',
      lastMessage: {
        dialogueID: 0
      }
    };                   //当前聊天对象
    this.msgList = [];   //当前消息列表
    this.dialogueId = 0;  //当前对话Id
    this.isLoaded = false;  //IM是否初始化完成

    this.init();   //初始化函数
  }

  async init(){
    await this.loadTalkerListData();
    await this.loadNewstQuoteData();
  }

  //加载聊天对象列表
  async loadTalkerListData(){
    const that = this;

    await this.api.GHIMGetTalkerMessages({
      relationType: that.options.relationType,
      relationId: that.options.relationId,
      relationUserId: that.options.relationUserId
    }).then(function (res) {
      if(res.isCompleted){
        let rData = res.data;

        that.talkerList = rData.map(function (item, index) {
          item.headImg = defaultImg;
          item.isUnread = false;
          item.tag = 0;
          item.time = '14:21';
          item.isActive = true;

          return item;

        }).filter(item => Boolean(item.userID > 0 && item.userID != that.options.relationUserId));

        if(that.talkerList <= 0){
          return false;
        }
        that.curTalker = that.talkerList[0];
        that.msgList.push(that.curTalker.lastMessage);
      }
    });

    that.isLoaded = true;
  }

  //切换当前聊天对象
  doSwitchCurTalker(item){
    this.curTalker = item;
    this.loadNewstQuoteData();
  }

  //加载聊天对象的历史信息
  async loadTalkerHistoryListData(){
    const that = this;

    if(that.msgList.length <= 0){
      return false;
    }

    await that.api.GHIMGetHistoryMessagesByRelationTalker({
      relationType: that.options.relationType,
      relationId: that.options.relationId,
      dialogueId: that.curTalker.lastMessage.dialogueID,
      lastMessageId: that.msgList[0].imMessageID
    }).
    then(function (res) {
      if(res.isCompleted){
        let rData = res.data;

        that.msgList = that.msgList.reverse().concat(rData).reverse();
      }
    });
  }

  //加载最新报价信息
  async loadNewstQuoteData() {
    const that = this;

    await that.api.GHInquiryGetQuoteByLast({inquiryId: that.options.relationId, supplierUserId: that.curTalker.lastMessage.toUserID}).then(function (res) {

    })
  }

};
